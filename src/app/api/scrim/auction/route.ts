import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

type AuctionPhase = "setup" | "auction" | "reauction" | "paused" | "done";

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
  auctionStartAt: Date | null;
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

let tablePromise: Promise<void> | null = null;
function ensureAuctionTable() {
  if (!tablePromise) {
    tablePromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AuctionState" (
          "id"              TEXT NOT NULL PRIMARY KEY,
          "sessionId"       TEXT NOT NULL UNIQUE,
          "phase"           TEXT NOT NULL DEFAULT 'setup',
          "pausedPhase"     TEXT,
          "captainPoints"   TEXT NOT NULL DEFAULT '{}',
          "queue"           TEXT NOT NULL DEFAULT '[]',
          "currentUserId"   TEXT,
          "currentBids"     TEXT NOT NULL DEFAULT '{}',
          "joinedCaptains"  TEXT NOT NULL DEFAULT '[]',
          "auctionStartAt"  TIMESTAMP(3),
          "auctionDuration" INTEGER NOT NULL DEFAULT 30,
          "failedQueue"     TEXT NOT NULL DEFAULT '[]',
          "bidLog"          TEXT NOT NULL DEFAULT '[]',
          "auditLog"        TEXT NOT NULL DEFAULT '[]',
          "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW()
        )
      `)
      .then(async () => {
        await prisma.$executeRawUnsafe(`ALTER TABLE "AuctionState" ADD COLUMN IF NOT EXISTS "pausedPhase" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "AuctionState" ADD COLUMN IF NOT EXISTS "bidLog" TEXT NOT NULL DEFAULT '[]'`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "AuctionState" ADD COLUMN IF NOT EXISTS "auditLog" TEXT NOT NULL DEFAULT '[]'`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "AuctionState" ADD COLUMN IF NOT EXISTS "joinedCaptains" TEXT NOT NULL DEFAULT '[]'`);
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "AuctionBid" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "sessionId" TEXT NOT NULL,
            "lotUserId" TEXT NOT NULL,
            "captainId" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuctionBid_sessionId_lotUserId_idx" ON "AuctionBid"("sessionId", "lotUserId")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuctionBid_sessionId_captainId_idx" ON "AuctionBid"("sessionId", "captainId")`);
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "AuctionPick" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "sessionId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "captainId" TEXT NOT NULL,
            "team" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AuctionPick_sessionId_userId_key" ON "AuctionPick"("sessionId", "userId")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuctionPick_sessionId_captainId_idx" ON "AuctionPick"("sessionId", "captainId")`);
      })
      .catch((error) => {
        tablePromise = null;
        throw error;
      });
  }
  return tablePromise;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

function broadcastAuction(sessionId: string, action: string, auction: AuctionRow | null) {
  broadcast(`scrim:${sessionId}`, { action, auction }).catch(() => {});
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

async function upsertAuction(sessionId: string, data: Record<string, unknown>) {
  const existing = await getAuction(sessionId);
  if (!existing) {
    const id = `auction_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuctionState" ("id","sessionId","phase","pausedPhase","captainPoints","queue","currentUserId","currentBids","joinedCaptains","auctionStartAt","auctionDuration","failedQueue","bidLog","auditLog","updatedAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
      id,
      sessionId,
      (data.phase as string) ?? "setup",
      (data.pausedPhase as string | null) ?? null,
      (data.captainPoints as string) ?? "{}",
      (data.queue as string) ?? "[]",
      (data.currentUserId as string | null) ?? null,
      (data.currentBids as string) ?? "{}",
      (data.joinedCaptains as string) ?? "[]",
      (data.auctionStartAt as Date | null) ?? null,
      (data.auctionDuration as number) ?? 30,
      (data.failedQueue as string) ?? "[]",
      (data.bidLog as string) ?? "[]",
      (data.auditLog as string) ?? "[]"
    );
  } else {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(data)) {
      sets.push(`"${k}" = $${idx++}`);
      vals.push(v);
    }
    if (sets.length === 0) return getAuction(sessionId);
    sets.push(`"updatedAt" = NOW()`);
    vals.push(sessionId);
    await prisma.$executeRawUnsafe(
      `UPDATE "AuctionState" SET ${sets.join(", ")} WHERE "sessionId" = $${idx}`,
      ...vals
    );
  }
  return getAuction(sessionId);
}

async function beginAuction(auction: AuctionRow, actorId: string) {
  if (auction.phase !== "setup") {
    throw new Error("경매 대기 상태에서만 시작할 수 있습니다.");
  }
  const queue = parseJson<string[]>(auction.queue, []);
  const nextUserId = queue[0] ?? null;
  const updated = await upsertAuction(auction.sessionId, {
    phase: nextUserId ? "auction" : "done",
    pausedPhase: null,
    queue: JSON.stringify(queue.slice(1)),
    currentUserId: nextUserId,
    currentBids: "{}",
    auctionStartAt: nextUserId ? new Date() : null,
    auditLog: appendLog(auction.auditLog, {
      actorId,
      action: "start",
      message: "주최자 링크에서 경매를 시작했습니다.",
    }),
  });
  if (updated?.phase === "done") await applyFinalAssignments(auction.sessionId);
  return updated;
}

async function finalizeCurrentLot(auction: AuctionRow, actorId = "system") {
  if (!auction.currentUserId) return auction;

  const bids = parseJson<Record<string, number>>(auction.currentBids, {});
  const entries = Object.entries(bids).filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const nextState = getNextAuctionState(auction, "failed");
    const updated = await upsertAuction(auction.sessionId, {
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

  if (!teamId) {
    throw new Error("낙찰 팀장을 찾을 수 없습니다.");
  }

  captainPoints[winnerId] = (captainPoints[winnerId] ?? 0) - winnerBid;
  await recordPick(auction.sessionId, auction.currentUserId, winnerId, teamId, winnerBid);

  const nextState = getNextAuctionState(auction, "sold");
  const updated = await upsertAuction(auction.sessionId, {
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

export async function GET(req: NextRequest) {
  await ensureAuctionTable();
  const { session } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  const auction = await getAuction(sessionId);
  if (
    auction &&
    (auction.phase === "auction" || auction.phase === "reauction") &&
    auction.auctionStartAt &&
    auction.currentUserId
  ) {
    const elapsed = (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000;
    if (elapsed >= auction.auctionDuration) {
      const updated = await finalizeCurrentLot(auction);
      return Response.json({ auction: updated });
    }
  }

  return Response.json({ auction });
}

export async function POST(req: NextRequest) {
  await ensureAuctionTable();
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const captainPoints = body.captainPoints as Record<string, number> | undefined;
  const auctionDuration = typeof body.auctionDuration === "number" ? body.auctionDuration : 30;

  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  if (!captainPoints || Object.keys(captainPoints).length < 2) {
    return Response.json({ error: "팀장을 2명 이상 지정해야 합니다." }, { status: 400 });
  }

  const captainIds = Object.keys(captainPoints);
  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionBid" WHERE "sessionId" = $1`, sessionId);
  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionPick" WHERE "sessionId" = $1`, sessionId);
  for (let i = 0; i < captainIds.length; i++) {
    const teamId = `team_${String.fromCharCode(97 + i)}`;
    await prisma.scrimPlayer.updateMany({
      where: { sessionId, userId: captainIds[i] },
      data: { team: teamId, role: "captain" },
    });
  }

  const allPlayers = await prisma.scrimPlayer.findMany({ where: { sessionId } });
  const nonCaptains = allPlayers.filter((p) => !captainIds.includes(p.userId)).map((p) => p.userId);
  const queue = shuffle(nonCaptains);

  const auction = await upsertAuction(sessionId, {
    phase: "setup",
    pausedPhase: null,
    captainPoints: JSON.stringify(captainPoints),
    queue: JSON.stringify(queue),
    currentUserId: null,
    currentBids: "{}",
    joinedCaptains: "[]",
    auctionStartAt: null,
    auctionDuration,
    failedQueue: "[]",
    bidLog: "[]",
    auditLog: appendLog("[]", {
      actorId: session.user.id,
      action: "start",
      message: `경매를 시작했습니다. 참가자 ${nonCaptains.length}명, 팀장 ${captainIds.length}명`,
    }),
  });

  broadcastAuction(sessionId, "auction_setup", auction);
  return Response.json({ success: true, auction });
}

export async function PATCH(req: NextRequest) {
  await ensureAuctionTable();
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const action = typeof body.action === "string" ? body.action : "bid";
  const bidAmount = typeof body.bidAmount === "number" ? body.bidAmount : 0;

  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  if (action === "setup_captains") {
    if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    const captainPoints = body.captainPoints as Record<string, number> | undefined;
    if (!captainPoints || typeof captainPoints !== "object") {
      return Response.json({ error: "captainPoints가 필요합니다." }, { status: 400 });
    }
    const auction = await upsertAuction(sessionId, {
      phase: "setup",
      pausedPhase: null,
      captainPoints: JSON.stringify(captainPoints),
      currentBids: "{}",
    });
    broadcastAuction(sessionId, "setup_captains", auction);
    return Response.json({ auction });
  }

  const auction = await getAuction(sessionId);
  if (!auction) return Response.json({ error: "경매 상태를 찾을 수 없습니다." }, { status: 404 });

  const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
  const captainIds = Object.keys(captainPoints);

  if (action !== "bid") {
    if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

    if (action === "begin") {
      try {
        const updated = await beginAuction(auction, session.user.id);
        broadcastAuction(sessionId, "auction_started", updated);
        return Response.json({ success: true, auction: updated });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "경매를 시작할 수 없습니다." }, { status: 400 });
      }
    }

    if (action === "resolve") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "처리할 현재 매물이 없습니다." }, { status: 400 });
      }
      const updated = await finalizeCurrentLot(auction, session.user.id);
      broadcastAuction(sessionId, "auction_resolved", updated);
      return Response.json({ success: true, auction: updated });
    }

    if (action === "pause") {
      if (auction.phase !== "auction" && auction.phase !== "reauction") {
        return Response.json({ error: "진행 중인 경매만 일시정지할 수 있습니다." }, { status: 400 });
      }
      const elapsed = auction.auctionStartAt ? (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000 : 0;
      const remaining = auction.auctionDuration > 0 ? Math.max(1, Math.ceil(auction.auctionDuration - elapsed)) : 0;
      const updated = await upsertAuction(sessionId, {
        phase: "paused",
        pausedPhase: auction.phase,
        auctionStartAt: null,
        auctionDuration: remaining,
        auditLog: appendLog(auction.auditLog, {
          actorId: session.user.id,
          action: "pause",
          message: "경매를 일시정지했습니다.",
        }),
      });
      broadcastAuction(sessionId, "auction_paused", updated);
      return Response.json({ success: true, auction: updated });
    }

    if (action === "resume") {
      if (auction.phase !== "paused") {
        return Response.json({ error: "일시정지 상태가 아닙니다." }, { status: 400 });
      }
      const updated = await upsertAuction(sessionId, {
        phase: auction.pausedPhase ?? "auction",
        pausedPhase: null,
        auctionStartAt: auction.currentUserId ? new Date() : null,
        auditLog: appendLog(auction.auditLog, {
          actorId: session.user.id,
          action: "resume",
          message: "경매를 재개했습니다.",
        }),
      });
      broadcastAuction(sessionId, "auction_resumed", updated);
      return Response.json({ success: true, auction: updated });
    }

    if (action === "pass") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "패스할 현재 매물이 없습니다." }, { status: 400 });
      }
      const nextState = getNextAuctionState(auction, "failed");
      const updated = await upsertAuction(sessionId, {
        ...nextState,
        auditLog: appendLog(auction.auditLog, {
          actorId: session.user.id,
          action: "pass",
          targetUserId: auction.currentUserId,
          message: "관리자가 현재 매물을 유찰 처리했습니다.",
        }),
      });
      if (updated?.phase === "done") await applyFinalAssignments(sessionId);
      broadcastAuction(sessionId, "auction_passed", updated);
      return Response.json({ success: true, auction: updated });
    }

    if (action === "forceAssign") {
      if ((auction.phase !== "auction" && auction.phase !== "reauction") || !auction.currentUserId) {
        return Response.json({ error: "강제 낙찰할 현재 매물이 없습니다." }, { status: 400 });
      }
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
      await recordPick(sessionId, auction.currentUserId, captainId, teamId, amount);
      const nextState = getNextAuctionState(auction, "sold");
      const updated = await upsertAuction(sessionId, {
        ...nextState,
        captainPoints: JSON.stringify(captainPoints),
        bidLog: appendLog(auction.bidLog, {
          actorId: session.user.id,
          action: "force_sold",
          captainId,
          targetUserId: auction.currentUserId,
          amount,
          message: `관리자 강제 낙찰: ${amount}P`,
        }),
        auditLog: appendLog(auction.auditLog, {
          actorId: session.user.id,
          action: "force_sold",
          captainId,
          targetUserId: auction.currentUserId,
          amount,
          message: "관리자가 현재 매물을 강제 낙찰 처리했습니다.",
        }),
      });
      if (updated?.phase === "done") await applyFinalAssignments(sessionId);
      broadcastAuction(sessionId, "auction_force_assigned", updated);
      return Response.json({ success: true, auction: updated });
    }

    return Response.json({ error: "지원하지 않는 경매 조작입니다." }, { status: 400 });
  }

  if (bidAmount <= 0) return Response.json({ error: "입찰 금액은 1 이상이어야 합니다." }, { status: 400 });
  if (auction.phase !== "auction" && auction.phase !== "reauction") {
    return Response.json({ error: "경매가 진행 중이 아닙니다." }, { status: 400 });
  }
  if (!auction.currentUserId) return Response.json({ error: "경매 중인 참가자가 없습니다." }, { status: 400 });

  if (!isAdmin && !captainIds.includes(session.user.id)) {
    return Response.json({ error: "팀장만 입찰할 수 있습니다." }, { status: 403 });
  }

  const captainId = isAdmin && body.captainId ? (body.captainId as string) : session.user.id;
  if (!captainIds.includes(captainId)) {
    return Response.json({ error: "유효한 팀장이 아닙니다." }, { status: 400 });
  }

  const available = captainPoints[captainId] ?? 0;
  if (bidAmount > available) {
    return Response.json({ error: `보유 포인트(${available}P)를 초과할 수 없습니다.` }, { status: 400 });
  }

  const currentBids = parseJson<Record<string, number>>(auction.currentBids, {});
  const existingBid = currentBids[captainId] ?? 0;
  const otherBids = Object.entries(currentBids).filter(([key]) => key !== captainId);
  if (otherBids.some(([, value]) => value === bidAmount)) {
    return Response.json({ error: "다른 팀과 같은 금액은 입찰할 수 없습니다." }, { status: 400 });
  }
  if (bidAmount <= existingBid) {
    return Response.json({ error: `현재 입찰가(${existingBid}P)보다 높아야 합니다.` }, { status: 400 });
  }

  currentBids[captainId] = bidAmount;
  await recordBid(sessionId, auction.currentUserId, captainId, bidAmount);

  const updated = await upsertAuction(sessionId, {
    currentBids: JSON.stringify(currentBids),
    bidLog: appendLog(auction.bidLog, {
      actorId: session.user.id,
      action: "bid",
      captainId,
      targetUserId: auction.currentUserId,
      amount: bidAmount,
      message: `${bidAmount}P 입찰`,
    }),
  });

  broadcastAuction(sessionId, "auction_bid", updated);
  return Response.json({ success: true, auction: updated });
}

export async function DELETE(req: NextRequest) {
  await ensureAuctionTable();
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionState" WHERE "sessionId" = $1`, sessionId);
  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionBid" WHERE "sessionId" = $1`, sessionId);
  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionPick" WHERE "sessionId" = $1`, sessionId);
  await prisma.scrimPlayer.updateMany({
    where: { sessionId },
    data: { team: "participant", role: "participant" },
  });

  broadcastAuction(sessionId, "auction_reset", null);
  return Response.json({ success: true });
}
