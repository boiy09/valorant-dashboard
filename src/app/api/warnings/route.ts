import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function ensureTypeColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Warning" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'warning'`
    );
  } catch {
    // column already exists or DB doesn't support IF NOT EXISTS – ignore
  }
}

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  await ensureTypeColumn();

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      userId: string;
      guildId: string;
      reason: string;
      issuedBy: string;
      active: boolean;
      note: string | null;
      type: string;
      createdAt: Date;
    }>
  >(
    guild
      ? `SELECT id, "userId", "guildId", reason, "issuedBy", active, note, COALESCE(type, 'warning') AS type, "createdAt" FROM "Warning" WHERE "guildId" = $1 ORDER BY "createdAt" DESC LIMIT $2`
      : `SELECT id, "userId", "guildId", reason, "issuedBy", active, note, COALESCE(type, 'warning') AS type, "createdAt" FROM "Warning" ORDER BY "createdAt" DESC LIMIT $1`,
    ...(guild
      ? [guild.id, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50]
      : [Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50])
  );

  // Attach user info
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      image: true,
      discordId: true,
      guilds: { select: { nickname: true }, take: 1 },
    },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const warnings = rows.map((w) => {
    const u = userMap.get(w.userId);
    return {
      ...w,
      active: Boolean(w.active),
      user: {
        name: u?.guilds[0]?.nickname ?? u?.name ?? null,
        image: u?.image ?? null,
        discordId: u?.discordId ?? null,
      },
    };
  });

  return Response.json({ warnings });
}

export async function POST(req: NextRequest) {
  const { isAdmin, guild: sessionGuild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  await ensureTypeColumn();

  const guild = sessionGuild ?? (await prisma.guild.findFirst());
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const {
    discordId,
    reason,
    note,
    issuedBy,
    type,
  } = body as {
    discordId?: string;
    reason?: string;
    note?: string;
    issuedBy?: string;
    type?: string;
  };

  if (!discordId || !reason?.trim()) {
    return Response.json({ error: "멤버와 경고 사유를 입력해주세요." }, { status: 400 });
  }

  const resolvedType = type === "complaint" ? "complaint" : "warning";
  const resolvedIssuedBy = issuedBy?.trim() || "관리자 (웹)";

  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return Response.json({ error: "해당 멤버를 찾을 수 없습니다." }, { status: 404 });

  const id = `wrn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Warning" (id, "userId", "guildId", reason, note, "issuedBy", active, type, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    id,
    user.id,
    guild.id,
    reason.trim(),
    note?.trim() || null,
    resolvedIssuedBy,
    true,
    resolvedType,
    now
  );

  const userWithGuilds = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      image: true,
      discordId: true,
      guilds: { select: { nickname: true }, take: 1 },
    },
  });

  const warning = {
    id,
    userId: user.id,
    guildId: guild.id,
    reason: reason.trim(),
    note: note?.trim() || null,
    issuedBy: resolvedIssuedBy,
    active: true,
    type: resolvedType,
    createdAt: now,
    user: {
      name: userWithGuilds?.guilds[0]?.nickname ?? userWithGuilds?.name ?? null,
      image: userWithGuilds?.image ?? null,
      discordId: userWithGuilds?.discordId ?? null,
    },
  };

  return Response.json({ warning });
}
