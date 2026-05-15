import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

// ─── 런타임 테이블 보장 ────────────────────────────────────────────────────────
let tablePromise: Promise<void> | null = null;
function ensureAuctionTable() {
  if (!tablePromise) {
    tablePromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AuctionState" (
          "id"              TEXT NOT NULL PRIMARY KEY,
          "sessionId"       TEXT NOT NULL UNIQUE,
          "phase"           TEXT NOT NULL DEFAULT 'setup',
          "captainPoints"   TEXT NOT NULL DEFAULT '{}',
          "queue"           TEXT NOT NULL DEFAULT '[]',
          "currentUserId"   TEXT,
          "currentBids"     TEXT NOT NULL DEFAULT '{}',
          "auctionStartAt"  TIMESTAMP(3),
          "auctionDuration" INTEGER NOT NULL DEFAULT 30,
          "failedQueue"     TEXT NOT NULL DEFAULT '[]',
          "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch(() => {
        tablePromise = null;
      });
  }
  return tablePromise;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
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

async function getAuction(sessionId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      sessionId: string;
      phase: string;
      captainPoints: string;
      queue: string;
      currentUserId: string | null;
      currentBids: string;
      auctionStartAt: Date | null;
      auctionDuration: number;
      failedQueue: string;
    }>
  >(`SELECT * FROM "AuctionState" WHERE "sessionId" = $1 LIMIT 1`, sessionId);
  return rows[0] ?? null;
}

async function upsertAuction(sessionId: string, data: Record<string, unknown>) {
  const existing = await getAuction(sessionId);
  if (!existing) {
    const id = `auction_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuctionState" ("id","sessionId","phase","captainPoints","queue","currentUserId","currentBids","auctionStartAt","auctionDuration","failedQueue","updatedAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      id,
      sessionId,
      (data.phase as string) ?? "setup",
      (data.captainPoints as string) ?? "{}",
      (data.queue as string) ?? "[]",
      (data.currentUserId as string | null) ?? null,
      (data.currentBids as string) ?? "{}",
      (data.auctionStartAt as Date | null) ?? null,
      (data.auctionDuration as number) ?? 30,
      (data.failedQueue as string) ?? "[]"
    );
  } else {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(data)) {
      sets.push(`"${k}" = $${idx++}`);
      vals.push(v);
    }
    sets.push(`"updatedAt" = NOW()`);
    vals.push(sessionId);
    await prisma.$executeRawUnsafe(
      `UPDATE "AuctionState" SET ${sets.join(", ")} WHERE "sessionId" = $${idx}`,
      ...vals
    );
  }
  return getAuction(sessionId);
}

// ─── GET: 경매 상태 조회 ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  await ensureAuctionTable();
  const { session } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  const auction = await getAuction(sessionId);

  // 타이머 만료 자동 처리
  if (
    auction &&
    (auction.phase === "auction" || auction.phase === "reauction") &&
    auction.auctionStartAt &&
    auction.currentUserId
  ) {
    const elapsed = (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000;
    if (elapsed >= auction.auctionDuration) {
      // 낙찰 또는 유찰 처리
      const bids = parseJson<Record<string, number>>(auction.currentBids, {});
      const entries = Object.entries(bids).filter(([, v]) => v > 0);
      const scrim = await prisma.scrimSession.findFirst({ where: { id: sessionId } });

      if (entries.length > 0) {
        // 낙찰: 최고가 팀장에게 배정
        const [winnerId, winnerBid] = entries.sort((a, b) => b[1] - a[1])[0];
        const points = parseJson<Record<string, number>>(auction.captainPoints, {});
        points[winnerId] = (points[winnerId] ?? 0) - winnerBid;

        // ScrimPlayer 팀 배정
        if (scrim) {
          const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
          const captainIds = Object.keys(captainPoints);
          const captainIndex = captainIds.indexOf(winnerId);
          const teamId = `team_${String.fromCharCode(97 + captainIndex)}`;
          await prisma.scrimPlayer.updateMany({
            where: { sessionId, userId: auction.currentUserId },
            data: { team: teamId, role: "member" },
          });
        }

        const queue = parseJson<string[]>(auction.queue, []);
        const failedQueue = parseJson<string[]>(auction.failedQueue, []);
        const nextUserId = queue[0] ?? null;
        const isReauction = auction.phase === "reauction";

        // 큐가 비면 재경매 또는 완료
        let nextPhase = auction.phase;
        if (queue.length === 0) {
          if (failedQueue.length > 0 && !isReauction) {
            nextPhase = "reauction";
          } else {
            nextPhase = "done";
          }
        }

        const updated = await upsertAuction(sessionId, {
          captainPoints: JSON.stringify(points),
          queue: JSON.stringify(queue.slice(1)),
          currentUserId: nextPhase === "done" ? null : (nextUserId ?? (failedQueue[0] ?? null)),
          currentBids: "{}",
          auctionStartAt: nextUserId || failedQueue.length > 0 ? new Date() : null,
          failedQueue: nextPhase === "reauction" ? JSON.stringify(failedQueue.slice(1)) : auction.failedQueue,
          phase: nextPhase,
        });
        return Response.json({ auction: updated });
      } else {
        // 유찰
        const failedQueue = parseJson<string[]>(auction.failedQueue, []);
        const queue = parseJson<string[]>(auction.queue, []);
        const nextUserId = queue[0] ?? null;
        let nextPhase = auction.phase;
        if (queue.length === 0) {
          nextPhase = failedQueue.length > 0 ? "reauction" : "done";
        }

        const updated = await upsertAuction(sessionId, {
          failedQueue: JSON.stringify([...failedQueue, auction.currentUserId]),
          queue: JSON.stringify(queue.slice(1)),
          currentUserId: nextPhase === "done" ? null : (nextUserId ?? (failedQueue[0] ?? null)),
          currentBids: "{}",
          auctionStartAt: nextUserId ? new Date() : null,
          phase: nextPhase,
        });
        return Response.json({ auction: updated });
      }
    }
  }

  return Response.json({ auction });
}

// ─── POST: 경매 초기화 (팀장 지정 + 포인트 설정 + 큐 생성) ──────────────────
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

  // 팀장 ScrimPlayer role 업데이트
  for (let i = 0; i < captainIds.length; i++) {
    const teamId = `team_${String.fromCharCode(97 + i)}`;
    await prisma.scrimPlayer.updateMany({
      where: { sessionId, userId: captainIds[i] },
      data: { team: teamId, role: "captain" },
    });
  }

  // 팀장 제외 참가자를 랜덤 순서로 큐 생성
  const allPlayers = await prisma.scrimPlayer.findMany({ where: { sessionId } });
  const nonCaptains = allPlayers
    .filter((p) => !captainIds.includes(p.userId))
    .map((p) => p.userId);
  const queue = shuffle(nonCaptains);

  const auction = await upsertAuction(sessionId, {
    phase: "auction",
    captainPoints: JSON.stringify(captainPoints),
    queue: JSON.stringify(queue.slice(1)),
    currentUserId: queue[0] ?? null,
    currentBids: "{}",
    auctionStartAt: queue.length > 0 ? new Date() : null,
    auctionDuration,
    failedQueue: "[]",
  });

  broadcast(`scrim:${sessionId}`, { action: "auction_started" }).catch(() => {});
  return Response.json({ success: true, auction });
}

// ─── PATCH: 입찰 ──────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  await ensureAuctionTable();
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const bidAmount = typeof body.bidAmount === "number" ? body.bidAmount : 0;

  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  if (bidAmount <= 0) return Response.json({ error: "입찰 금액은 1 이상이어야 합니다." }, { status: 400 });

  const auction = await getAuction(sessionId);
  if (!auction) return Response.json({ error: "경매 상태를 찾을 수 없습니다." }, { status: 404 });
  if (auction.phase !== "auction" && auction.phase !== "reauction") {
    return Response.json({ error: "경매가 진행 중이 아닙니다." }, { status: 400 });
  }
  if (!auction.currentUserId) return Response.json({ error: "경매 중인 참가자가 없습니다." }, { status: 400 });

  const captainPoints = parseJson<Record<string, number>>(auction.captainPoints, {});
  const captainIds = Object.keys(captainPoints);

  // 관리자가 아닌 경우 본인이 팀장인지 확인
  if (!isAdmin && !captainIds.includes(session.user.id)) {
    return Response.json({ error: "팀장만 입찰할 수 있습니다." }, { status: 403 });
  }

  const captainId = isAdmin && body.captainId ? (body.captainId as string) : session.user.id;

  const available = captainPoints[captainId] ?? 0;
  if (bidAmount > available) {
    return Response.json({ error: `보유 포인트(${available}P)를 초과할 수 없습니다.` }, { status: 400 });
  }

  const currentBids = parseJson<Record<string, number>>(auction.currentBids, {});

  // 동점 입찰 방지
  const existingBid = currentBids[captainId] ?? 0;
  const otherBids = Object.entries(currentBids).filter(([k]) => k !== captainId);
  if (otherBids.some(([, v]) => v === bidAmount)) {
    return Response.json({ error: "다른 팀장과 같은 금액은 입찰할 수 없습니다." }, { status: 400 });
  }
  if (bidAmount <= existingBid) {
    return Response.json({ error: `현재 입찰가(${existingBid}P)보다 높아야 합니다.` }, { status: 400 });
  }

  currentBids[captainId] = bidAmount;

  const updated = await upsertAuction(sessionId, {
    currentBids: JSON.stringify(currentBids),
  });

  broadcast(`scrim:${sessionId}`, { action: "auction_bid" }).catch(() => {});
  return Response.json({ success: true, auction: updated });
}

// ─── DELETE: 경매 상태 초기화 ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  await ensureAuctionTable();
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  await prisma.$executeRawUnsafe(`DELETE FROM "AuctionState" WHERE "sessionId" = $1`, sessionId);

  // ScrimPlayer 팀 배정 초기화
  await prisma.scrimPlayer.updateMany({
    where: { sessionId },
    data: { team: "participant", role: "participant" },
  });

  broadcast(`scrim:${sessionId}`, { action: "auction_reset" }).catch(() => {});
  return Response.json({ success: true });
}
