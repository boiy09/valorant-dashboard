import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

async function ensureScrimGameTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScrimGame" (
      "id"           TEXT NOT NULL,
      "sessionId"    TEXT NOT NULL,
      "gameNumber"   INTEGER NOT NULL,
      "map"          TEXT,
      "winnerId"     TEXT,
      "matchId"      TEXT,
      "teamSnapshot" TEXT NOT NULL DEFAULT '{}',
      "kdaSnapshot"  TEXT NOT NULL DEFAULT '[]',
      "playedAt"     TIMESTAMP(3),
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ScrimGame_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ScrimGame_sessionId_gameNumber_key"
    ON "ScrimGame"("sessionId", "gameNumber")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ScrimGame_sessionId_idx"
    ON "ScrimGame"("sessionId")
  `);
}

function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const p = JSON.parse(value);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return value.split(",").map((x) => x.trim()).filter(Boolean);
  }
}

// ─── GET: 경기 목록 조회 ──────────────────────────────────────────────────────
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureScrimGameTable();
  const { session, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({
    where: { id, ...(guild ? { guildId: guild.id } : {}) },
  });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const games = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      sessionId: string;
      gameNumber: number;
      map: string | null;
      winnerId: string | null;
      matchId: string | null;
      teamSnapshot: string;
      kdaSnapshot: string;
      roundResults: string | null;
      playedAt: Date | null;
      createdAt: Date;
    }>
  >(`SELECT * FROM "ScrimGame" WHERE "sessionId" = $1 ORDER BY "gameNumber" ASC`, id);

  return Response.json({ games });
}

// ─── POST: 경기 추가 ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureScrimGameTable();
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const managers = parseIdList(scrim.managers || scrim.createdBy);
  if (!isAdmin && !managers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // 다음 경기 번호 계산
  const existing = await prisma.$queryRawUnsafe<Array<{ gameNumber: number }>>(
    `SELECT "gameNumber" FROM "ScrimGame" WHERE "sessionId" = $1 ORDER BY "gameNumber" DESC LIMIT 1`,
    id
  );
  const nextNumber = existing.length > 0 ? existing[0].gameNumber + 1 : 1;

  // 현재 팀 구성 스냅샷 (players에서 팀별 userId 목록)
  const players = await prisma.scrimPlayer.findMany({
    where: { sessionId: id },
    select: { userId: true, team: true, role: true },
  });
  const teamSnapshot: Record<string, string[]> = {};
  for (const p of players) {
    if (!p.team.startsWith("team_")) continue;
    if (!teamSnapshot[p.team]) teamSnapshot[p.team] = [];
    teamSnapshot[p.team].push(p.userId);
  }

  const gameId = `scrimgame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ScrimGame" ("id", "sessionId", "gameNumber", "map", "teamSnapshot", "kdaSnapshot", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    gameId,
    id,
    nextNumber,
    body.map ?? scrim.map ?? null,
    JSON.stringify(teamSnapshot),
    "[]"
  );

  const [game] = await prisma.$queryRawUnsafe<Array<{ id: string; sessionId: string; gameNumber: number; map: string | null; winnerId: string | null; matchId: string | null; teamSnapshot: string; kdaSnapshot: string; roundResults: string | null; playedAt: Date | null; createdAt: Date }>>(
    `SELECT * FROM "ScrimGame" WHERE "id" = $1`,
    gameId
  );

  broadcast(`scrim:${id}`, { action: "game_added" }).catch(() => {});
  return Response.json({ game });
}

// ─── PATCH: 경기 수정 (맵, 승패, KDA, matchId) ───────────────────────────────
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureScrimGameTable();
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const managers = parseIdList(scrim.managers || scrim.createdBy);
  if (!isAdmin && !managers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { gameId, map, winnerId, matchId, kdaSnapshot } = body;
  if (!gameId) return Response.json({ error: "gameId가 필요합니다." }, { status: 400 });

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (map !== undefined) { setClauses.push(`"map" = $${idx++}`); values.push(map ?? null); }
  if (winnerId !== undefined) { setClauses.push(`"winnerId" = $${idx++}`); values.push(winnerId ?? null); }
  if (matchId !== undefined) { setClauses.push(`"matchId" = $${idx++}`); values.push(matchId ?? null); }
  if (kdaSnapshot !== undefined) { setClauses.push(`"kdaSnapshot" = $${idx++}`); values.push(JSON.stringify(kdaSnapshot)); }
  if (winnerId !== undefined && winnerId !== null) {
    setClauses.push(`"playedAt" = $${idx++}`);
    values.push(new Date());
  }

  if (setClauses.length === 0) return Response.json({ error: "변경 사항이 없습니다." }, { status: 400 });

  values.push(gameId);
  await prisma.$executeRawUnsafe(
    `UPDATE "ScrimGame" SET ${setClauses.join(", ")} WHERE "id" = $${idx} AND "sessionId" = $${idx + 1}`,
    ...values,
    id
  );

  const [game] = await prisma.$queryRawUnsafe<Array<{ id: string; sessionId: string; gameNumber: number; map: string | null; winnerId: string | null; matchId: string | null; teamSnapshot: string; kdaSnapshot: string; roundResults: string | null; playedAt: Date | null; createdAt: Date }>>(
    `SELECT * FROM "ScrimGame" WHERE "id" = $1`,
    gameId
  );

  broadcast(`scrim:${id}`, { action: "game_updated" }).catch(() => {});
  return Response.json({ game });
}

// ─── DELETE: 경기 삭제 ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureScrimGameTable();
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const managers = parseIdList(scrim.managers || scrim.createdBy);
  if (!isAdmin && !managers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { gameId } = body;
  if (!gameId) return Response.json({ error: "gameId가 필요합니다." }, { status: 400 });

  await prisma.$executeRawUnsafe(
    `DELETE FROM "ScrimGame" WHERE "id" = $1 AND "sessionId" = $2`,
    gameId,
    id
  );

  // 경기 번호 재정렬
  const remaining = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ScrimGame" WHERE "sessionId" = $1 ORDER BY "gameNumber" ASC`,
    id
  );
  for (let i = 0; i < remaining.length; i++) {
    await prisma.$executeRawUnsafe(
      `UPDATE "ScrimGame" SET "gameNumber" = $1 WHERE "id" = $2`,
      i + 1,
      remaining[i].id
    );
  }

  broadcast(`scrim:${id}`, { action: "game_deleted" }).catch(() => {});
  return Response.json({ success: true });
}
