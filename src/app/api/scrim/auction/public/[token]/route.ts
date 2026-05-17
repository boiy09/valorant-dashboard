import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";
import { verifyAuctionAccessToken } from "@/lib/auctionAccess";
import { auth } from "@/lib/auth";

type AuctionPhase = "setup" | "auction" | "reauction" | "paused" | "done";
const MIN_BID_INCREMENT = 10;

interface AuctionRow {
  id: string;
  sessionId: string;
  phase: AuctionPhase;
  pausedPhase: AuctionPhase | null;
  captainPoints: string;
  queue: string;
  currentUserId: string | null;
  currentBids: string;
  joinedCaptains: string;
  auctionStartAt: Date | string | null;
  auctionDuration: number;
  failedQueue: string;
  bidLog: string;
  auditLog: string;
  picks?: AuctionPickRow[];
  bidHistory?: AuctionBidRow[];
}

interface AuctionPickRow {
  id: string;
  sessionId: string;
  userId: string;
  captainId: string;
  team: string;
  amount: number;
  createdAt: Date;
}

interface AuctionBidRow {
  id: string;
  sessionId: string;
  lotUserId: string;
  captainId: string;
  amount: number;
  createdAt: Date;
}

interface AuctionLogEntry {
  id: string;
  ts: string;
  actorId?: string;
  action: string;
  message: string;
  captainId?: string;
  targetUserId?: string;
  amount?: number;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function appendLog(raw: string | null | undefined, entry: Omit<AuctionLogEntry, "id" | "ts">) {
  const rows = parseJson<AuctionLogEntry[]>(raw, []);
  const next: AuctionLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    ...entry,
  };
  return JSON.stringify([...rows, next].slice(-200));
}

function getTeamIdByCaptain(captainIds: string[], captainId: string) {
  const index = captainIds.indexOf(captainId);
  if (index < 0) return null;
  return `team_${String.fromCharCode(97 + index)}`;
}

function getNextAuctionState(auction: AuctionRow, result: "sold" | "failed") {
  const queue = parseJson<string[]>(auction.queue, []);
  const currentFailedQueue = parseJson<string[]>(auction.failedQueue, []);
  const nextQueue = queue.slice(1);
  let failedQueue = currentFailedQueue;

  if (result === "failed" && auction.currentUserId && auction.phase !== "reauction") {
    failedQueue = [...currentFailedQueue, auction.currentUserId];
  }

  let nextPhase: AuctionPhase = auction.phase;
  let nextUserId: string | null = queue[0] ?? null;

  if (!nextUserId) {
    if (auction.phase === "auction" && failedQueue.length > 0) {
      nextPhase = "reauction";
      nextUserId = failedQueue[0] ?? null;
      failedQueue = failedQueue.slice(1);
    } else {
      nextPhase = "done";
      nextUserId = null;
    }
  }

  return {
    phase: nextPhase,
    queue: JSON.stringify(nextQueue),
    failedQueue: JSON.stringify(failedQueue),
    currentUserId: nextUserId,
    currentBids: "{}",
    auctionStartAt: nextUserId ? new Date() : null,
    pausedPhase: null,
  };
}

async function getAuction(sessionId: string) {
  const rows = await prisma.$queryRawUnsafe<AuctionRow[]>(
    `SELECT * FROM "AuctionState" WHERE "sessionId" = $1 LIMIT 1`,
    sessionId
  );
  const auction = rows[0] ?? null;
  if (!auction) return null;
  const [picks, bidHistory] = await Promise.all([
    prisma.$queryRawUnsafe<AuctionPickRow[]>(
      `SELECT * FROM "AuctionPick" WHERE "sessionId" = $1 ORDER BY "createdAt" ASC`,
      sessionId
    ),
    prisma.$queryRawUnsafe<AuctionBidRow[]>(
      `SELECT * FROM "AuctionBid" WHERE "sessionId" = $1 ORDER BY "createdAt" ASC`,
      sessionId
    ),
  ]);
  return { ...auction, picks, bidHistory };
}

async function recordBid(sessionId: string, lotUserId: string, captainId: string, amount: number) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuctionBid" ("id","sessionId","lotUserId","captainId","amount","createdAt")
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    `bid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId,
    lotUserId,
    captainId,
    amount
  );
}

async function recordPick(sessionId: string, userId: string, captainId: string, team: string, amount: number) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuctionPick" ("id","sessionId","userId","captainId","team","amount","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT ("sessionId","userId")
     DO UPDATE SET "captainId" = EXCLUDED."captainId", "team" = EXCLUDED."team", "amount" = EXCLUDED."amount"`,
    `pick_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId,
    userId,
    captainId,
    team,
    amount
  );
}

async function applyFinalAssignments(sessionId: string) {
  const picks = await prisma.$queryRawUnsafe<AuctionPickRow[]>(
    `SELECT * FROM "AuctionPick" WHERE "sessionId" = $1`,
    sessionId
  );
  for (const pick of picks) {
    await prisma.scrimPlayer.updateMany({
      where: { sessionId, userId: pick.userId },
      data: { team: pick.team, role: "member" },
    });
  }
}

async function updateAuction(sessionId: string, data: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    sets.push(`"${key}" = $${idx++}`);
    vals.push(value);
  }
  if (sets.length === 0) return getAuction(sessionId);
  sets.push(`"updatedAt" = NOW()`);
  vals.push(sessionId);
  await prisma.$executeRawUnsafe(
    `UPDATE "AuctionState" SET ${sets.join(", ")} WHERE "sessionId" = $${idx}`,
    ...vals
  );
  return getAuction(sessionId);
}

async function beginAuction(auction: AuctionRow) {
  if (auction.phase !== "setup") {
    throw new Error("경매 대기 상태에서만 시작할 수 있습니다.");
  }
  const queue = parseJson<string[]>(auction.queue, []);
  if (queue.length === 0) {
    throw new Error("경매 매물이 없습니다. 참가자를 로드하거나 팀장이 아닌 참가자를 남겨둔 뒤 시작해 주세요.");
  }
  const nextUserId = queue[0] ?? null;
  const updated = await updateAuction(auction.sessionId, {
    phase: nextUserId ? "auction" : "done",
    pausedPhase: null,
    queue: JSON.stringify(queue.slice(1)),
    currentUserId: nextUserId,
    currentBids: "{}",
    auctionStartAt: nextUserId ? new Date() : null,
    auditLog: appendLog(auction.auditLog, {
      actorId: "host-link",
      action: "start",
      message: "주최자 링크에서 경매를 시작했습니다.",
    }),
  });
  if (updated?.phase === "done") await applyFinalAssignments(auction.sessionId);
  return updated;
}

async function finalizeCurrentLot(auction: AuctionRow, actorId = "public-room") {
  if (!auction.currentUserId) return auction;

  const bids = parseJson<Record<string, number>>(auction.currentBids, {});
  const entries = Object.entries(bids).filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const nextState = getNextAuctionState(auction, "failed");
    const updated = await updateAuction(auction.sessionId, {
      ...nextState,
      auditLog: appendLog(auction.auditLog, {
        actorId,
        action: "no_bid",
        targetUserId: auction.currentUserId,
        message: "입찰 없이 유찰 처리되었습니다.",
      }),
    });
    if (updated?.phase === "done") await applyFinalAssignments(auction.sessionId);
    return updated;
  }

  const [winnerId, winnerBid] = entries.sort((a, b) => b[1] - a[1])[0];
  const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
  const captainIds = Object.keys(captainPoints);
  const teamId = getTeamIdByCaptain(captainIds, winnerId);
  if (!teamId) throw new Error("낙찰 팀을 찾을 수 없습니다.");

  captainPoints[winnerId] = (captainPoints[winnerId] ?? 0) - winnerBid;
  await recordPick(auction.sessionId, auction.currentUserId, winnerId, teamId, winnerBid);

  const nextState = getNextAuctionState(auction, "sold");
  const updated = await updateAuction(auction.sessionId, {
    ...nextState,
    captainPoints: JSON.stringify(captainPoints),
    bidLog: appendLog(auction.bidLog, {
      actorId,
      action: "sold",
      captainId: winnerId,
      targetUserId: auction.currentUserId,
      amount: winnerBid,
      message: `${winnerBid}P에 낙찰되었습니다.`,
    }),
    auditLog: appendLog(auction.auditLog, {
      actorId,
      action: "sold",
      captainId: winnerId,
      targetUserId: auction.currentUserId,
      amount: winnerBid,
      message: "타이머 종료로 자동 낙찰되었습니다.",
    }),
  });
  if (updated?.phase === "done") await applyFinalAssignments(auction.sessionId);
  return updated;
}

async function maybeFinalize(auction: AuctionRow | null) {
  if (
    auction &&
    (auction.phase === "auction" || auction.phase === "reauction") &&
    auction.auctionStartAt &&
    auction.currentUserId &&
    auction.auctionDuration > 0
  ) {
    const elapsed = (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000;
    if (elapsed >= auction.auctionDuration) {
      const updated = await finalizeCurrentLot(auction);
      broadcast(`scrim:${auction.sessionId}`, { action: "auction_resolved", auction: updated }).catch(() => {});
      return updated;
    }
  }
  return auction;
}

async function getRoom(sessionId: string) {
  const scrim = await prisma.scrimSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              discordId: true,
              name: true,
              image: true,
              valorantRole: true,
              favoriteAgents: true,
              guilds: {
                select: {
                  guildId: true,
                  nickname: true,
                },
              },
              riotAccounts: {
                select: {
                  gameName: true,
                  tagLine: true,
                  region: true,
                  cachedTierName: true,
                  cachedCard: true,
                  cachedLevel: true,
                },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  const auction = await maybeFinalize(await getAuction(sessionId));
  return { scrim, auction };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = verifyAuctionAccessToken(token);
  if (!access) return Response.json({ error: "유효하지 않은 경매 링크입니다." }, { status: 401 });

  const { scrim, auction } = await getRoom(access.sessionId);
  if (!scrim) return Response.json({ error: "경매방을 찾을 수 없습니다." }, { status: 404 });
  if (scrim.mode !== "auction") return Response.json({ error: "경매 내전이 아닙니다." }, { status: 400 });

  const session = await auth().catch(() => null);
  const captainPlayer = access.role === "captain" && access.captainId
    ? scrim.players.find((player) => player.userId === access.captainId || player.user.id === access.captainId)
    : null;
  const matchesCaptain = access.role === "captain" && access.captainId
    ? Boolean(session?.user?.id && captainPlayer?.user.discordId && session.user.id === captainPlayer.user.discordId)
    : null;

  const viewer = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        matchesCaptain,
      }
    : null;

  return Response.json({
    access: { role: access.role, captainId: access.captainId ?? null },
    scrim,
    auction,
    viewer,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = verifyAuctionAccessToken(token);
  if (!access) return Response.json({ error: "유효하지 않은 경매 링크입니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "bid";
  const bidAmount = typeof body.bidAmount === "number" ? body.bidAmount : 0;

  const auction = await maybeFinalize(await getAuction(access.sessionId));
  if (!auction) return Response.json({ error: "경매 상태를 찾을 수 없습니다." }, { status: 404 });

  if (action === "confirmJoin") {
    if (access.role !== "captain" || !access.captainId) {
      return Response.json({ error: "팀장 링크가 필요합니다." }, { status: 403 });
    }
    const session = await auth().catch(() => null);
    const captain = await prisma.scrimPlayer.findFirst({
      where: { sessionId: access.sessionId, userId: access.captainId },
      include: { user: { select: { discordId: true } } },
    });
    if (!session?.user?.id || !captain?.user.discordId || session.user.id !== captain.user.discordId) {
      return Response.json({ error: "현재 로그인한 Discord 계정이 이 팀장 링크와 다릅니다." }, { status: 403 });
    }

    const joinedCaptains = parseJson<string[]>(auction.joinedCaptains, []);
    const updated = joinedCaptains.includes(access.captainId)
      ? auction
      : await updateAuction(access.sessionId, {
          joinedCaptains: JSON.stringify([...joinedCaptains, access.captainId]),
          auditLog: appendLog(auction.auditLog, {
            actorId: access.captainId,
            action: "captain_joined",
            captainId: access.captainId,
            message: "팀장이 본인 확인 후 입장을 완료했습니다.",
          }),
        });
    broadcast(`scrim:${access.sessionId}`, { action: "auction_captain_joined", auction: updated }).catch(() => {});
    return Response.json({ success: true, auction: updated });
  }

  if (action === "captainPass") {
    if (access.role !== "captain" || !access.captainId) {
      return Response.json({ error: "팀장 링크로만 유찰할 수 있습니다." }, { status: 403 });
    }
    if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
      return Response.json({ error: "유찰할 현재 매물이 없습니다." }, { status: 400 });
    }

    const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
    const captainIds = Object.keys(captainPoints);
    const captainId = access.captainId;
    if (!captainIds.includes(captainId)) return Response.json({ error: "유효한 팀장이 아닙니다." }, { status: 400 });

    const currentBids = parseJson<Record<string, number>>(auction.currentBids, {});
    currentBids[captainId] = -1;
    const positiveBids = Object.entries(currentBids).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const activeCaptainIds = captainIds.filter((id) => currentBids[id] !== -1);
    const auctionWithPass = { ...auction, currentBids: JSON.stringify(currentBids) };

    let updated: AuctionRow | null;
    if (activeCaptainIds.length === 0 || (positiveBids.length > 0 && activeCaptainIds.length === 1 && activeCaptainIds[0] === positiveBids[0][0])) {
      updated = await finalizeCurrentLot(auctionWithPass, captainId);
    } else {
      updated = await updateAuction(access.sessionId, {
        currentBids: JSON.stringify(currentBids),
        bidLog: appendLog(auction.bidLog, {
          actorId: captainId,
          action: "captain_pass",
          captainId,
          targetUserId: auction.currentUserId,
          message: "팀장이 현재 매물 경매를 포기했습니다.",
        }),
      });
    }

    broadcast(`scrim:${access.sessionId}`, { action: "auction_captain_passed", auction: updated }).catch(() => {});
    return Response.json({ success: true, auction: updated });
  }

  if (action !== "bid") {
    if (access.role !== "host") return Response.json({ error: "주최자 링크가 필요합니다." }, { status: 403 });

    if (action === "begin") {
      try {
        const updated = await beginAuction(auction);
        broadcast(`scrim:${access.sessionId}`, { action: "auction_started", auction: updated }).catch(() => {});
        return Response.json({ success: true, auction: updated });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "경매를 시작할 수 없습니다." }, { status: 400 });
      }
    }

    if (action === "pause") {
      if (auction.phase !== "auction" && auction.phase !== "reauction") {
        return Response.json({ error: "진행 중인 경매만 일시정지할 수 있습니다." }, { status: 400 });
      }
      const elapsed = auction.auctionStartAt ? (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000 : 0;
      const remaining = auction.auctionDuration > 0 ? Math.max(1, Math.ceil(auction.auctionDuration - elapsed)) : 0;
      const updated = await updateAuction(access.sessionId, {
        phase: "paused",
        pausedPhase: auction.phase,
        auctionStartAt: null,
        auctionDuration: remaining,
        auditLog: appendLog(auction.auditLog, {
          actorId: "host-link",
          action: "pause",
          message: "주최자 링크에서 경매를 일시정지했습니다.",
        }),
      });
      broadcast(`scrim:${access.sessionId}`, { action: "auction_paused", auction: updated }).catch(() => {});
      return Response.json({ success: true, auction: updated });
    }

    if (action === "resume") {
      if (auction.phase !== "paused") {
        return Response.json({ error: "일시정지 상태가 아닙니다." }, { status: 400 });
      }
      const updated = await updateAuction(access.sessionId, {
        phase: auction.pausedPhase ?? "auction",
        pausedPhase: null,
        auctionStartAt: auction.currentUserId ? new Date() : null,
        auditLog: appendLog(auction.auditLog, {
          actorId: "host-link",
          action: "resume",
          message: "주최자 링크에서 경매를 재개했습니다.",
        }),
      });
      broadcast(`scrim:${access.sessionId}`, { action: "auction_resumed", auction: updated }).catch(() => {});
      return Response.json({ success: true, auction: updated });
    }

    if (action === "forceAssign") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "낙찰 처리할 현재 매물이 없습니다." }, { status: 400 });
      }
      const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
      const captainIds = Object.keys(captainPoints);
      const captainId = typeof body.captainId === "string" ? body.captainId : "";
      if (!captainIds.includes(captainId)) {
        return Response.json({ error: "유효한 팀장을 선택해야 합니다." }, { status: 400 });
      }
      const amount = Math.max(0, bidAmount);
      const available = captainPoints[captainId] ?? 0;
      if (amount > available) {
        return Response.json({ error: `보유 포인트(${available}P)를 초과할 수 없습니다.` }, { status: 400 });
      }
      const teamId = getTeamIdByCaptain(captainIds, captainId);
      if (!teamId) return Response.json({ error: "팀 정보를 찾을 수 없습니다." }, { status: 400 });

      captainPoints[captainId] = available - amount;
      await recordPick(access.sessionId, auction.currentUserId, captainId, teamId, amount);
      const nextState = getNextAuctionState(auction, "sold");
      const updated = await updateAuction(access.sessionId, {
        ...nextState,
        captainPoints: JSON.stringify(captainPoints),
        bidLog: appendLog(auction.bidLog, {
          actorId: "host-link",
          action: "force_sold",
          captainId,
          targetUserId: auction.currentUserId,
          amount,
          message: `주최자 낙찰: ${amount}P`,
        }),
        auditLog: appendLog(auction.auditLog, {
          actorId: "host-link",
          action: "force_sold",
          captainId,
          targetUserId: auction.currentUserId,
          amount,
          message: "주최자 링크에서 현재 매물을 낙찰 처리했습니다.",
        }),
      });
      if (updated?.phase === "done") await applyFinalAssignments(access.sessionId);
      broadcast(`scrim:${access.sessionId}`, { action: "auction_force_assigned", auction: updated }).catch(() => {});
      return Response.json({ success: true, auction: updated });
    }

    if (action === "resolve") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "처리할 현재 매물이 없습니다." }, { status: 400 });
      }
      const updated = await finalizeCurrentLot(auction, "host-link");
      broadcast(`scrim:${access.sessionId}`, { action: "auction_resolved", auction: updated }).catch(() => {});
      return Response.json({ success: true, auction: updated });
    }

    if (action === "pass") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "유찰 처리할 현재 매물이 없습니다." }, { status: 400 });
      }
      const nextState = getNextAuctionState(auction, "failed");
      const updated = await updateAuction(access.sessionId, {
        ...nextState,
        auditLog: appendLog(auction.auditLog, {
          actorId: "host-link",
          action: "pass",
          targetUserId: auction.currentUserId,
          message: "주최자 링크에서 현재 매물을 유찰 처리했습니다.",
        }),
      });
      if (updated?.phase === "done") await applyFinalAssignments(access.sessionId);
      broadcast(`scrim:${access.sessionId}`, { action: "auction_passed", auction: updated }).catch(() => {});
      return Response.json({ success: true, auction: updated });
    }

    return Response.json({ error: "지원하지 않는 경매 조작입니다." }, { status: 400 });
  }

  if (access.role !== "captain" || !access.captainId) {
    return Response.json({ error: "팀장 링크로만 입찰할 수 있습니다." }, { status: 403 });
  }
  if (bidAmount <= 0) return Response.json({ error: "입찰 금액은 1 이상이어야 합니다." }, { status: 400 });
  if (auction.phase !== "auction" && auction.phase !== "reauction") {
    return Response.json({ error: "경매가 진행 중이 아닙니다." }, { status: 400 });
  }
  if (!auction.currentUserId) return Response.json({ error: "경매 중인 참가자가 없습니다." }, { status: 400 });

  const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
  const captainIds = Object.keys(captainPoints);
  const captainId = access.captainId;
  if (!captainIds.includes(captainId)) return Response.json({ error: "유효한 팀장이 아닙니다." }, { status: 400 });

  const available = captainPoints[captainId] ?? 0;
  if (bidAmount > available) {
    return Response.json({ error: `보유 포인트(${available}P)를 초과할 수 없습니다.` }, { status: 400 });
  }

  const currentBids = parseJson<Record<string, number>>(auction.currentBids, {});
  if (currentBids[captainId] === -1) {
    return Response.json({ error: "이미 이 매물 경매를 포기했습니다." }, { status: 400 });
  }
  const existingBid = Math.max(0, currentBids[captainId] ?? 0);
  const otherBids = Object.entries(currentBids).filter(([key]) => key !== captainId);
  const highestOtherBid = Math.max(0, ...otherBids.map(([, value]) => value).filter((value) => value > 0));
  const minimumBid = Math.max(MIN_BID_INCREMENT, highestOtherBid + MIN_BID_INCREMENT, existingBid > 0 ? existingBid + MIN_BID_INCREMENT : MIN_BID_INCREMENT);
  if (bidAmount < minimumBid) {
    return Response.json({ error: `최소 입찰가는 ${minimumBid}P입니다.` }, { status: 400 });
  }
  if (otherBids.some(([, value]) => value === bidAmount)) {
    return Response.json({ error: "다른 팀과 같은 금액은 입찰할 수 없습니다." }, { status: 400 });
  }
  if (bidAmount <= existingBid) {
    return Response.json({ error: `현재 입찰가(${existingBid}P)보다 높아야 합니다.` }, { status: 400 });
  }

  currentBids[captainId] = bidAmount;
  await recordBid(access.sessionId, auction.currentUserId, captainId, bidAmount);
  const updated = await updateAuction(access.sessionId, {
    currentBids: JSON.stringify(currentBids),
    bidLog: appendLog(auction.bidLog, {
      actorId: captainId,
      action: "bid",
      captainId,
      targetUserId: auction.currentUserId,
      amount: bidAmount,
      message: `${bidAmount}P 입찰`,
    }),
  });

  broadcast(`scrim:${access.sessionId}`, { action: "auction_bid", auction: updated }).catch(() => {});
  return Response.json({ success: true, auction: updated });
}
