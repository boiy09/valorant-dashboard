import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { syncWarningAutomation } from "@/lib/adminAutomation";
import { prisma } from "@/lib/prisma";

async function ensureWarningColumns() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Warning" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'warning'`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Warning" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
  } catch {
    // Best-effort runtime repair; migrations are the source of truth.
  }
}

function clampLimit(value: string | null) {
  const parsed = parseInt(value ?? "200", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 200;
}

function resolveType(type?: string) {
  return type === "complaint" ? "complaint" : "warning";
}

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  await ensureWarningColumns();

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));
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
      updatedAt: Date;
    }>
  >(
    guild
      ? `SELECT id, "userId", "guildId", reason, "issuedBy", active, note, COALESCE(type, 'warning') AS type, "createdAt", "updatedAt" FROM "Warning" WHERE "guildId" = $1 ORDER BY "createdAt" DESC LIMIT $2`
      : `SELECT id, "userId", "guildId", reason, "issuedBy", active, note, COALESCE(type, 'warning') AS type, "createdAt", "updatedAt" FROM "Warning" ORDER BY "createdAt" DESC LIMIT $1`,
    ...(guild ? [guild.id, limit] : [limit])
  );

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

  const warnings = rows.map((item) => {
    const user = userMap.get(item.userId);
    return {
      ...item,
      active: Boolean(item.active),
      type: resolveType(item.type),
      user: {
        name: user?.guilds[0]?.nickname ?? user?.name ?? null,
        image: user?.image ?? null,
        discordId: user?.discordId ?? null,
      },
    };
  });

  return Response.json({ warnings });
}

export async function POST(req: NextRequest) {
  const { isAdmin, guild: sessionGuild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  await ensureWarningColumns();

  const guild = sessionGuild ?? (await prisma.guild.findFirst());
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { discordId, reason, note, issuedBy, type } = body as {
    discordId?: string;
    reason?: string;
    note?: string;
    issuedBy?: string;
    type?: string;
  };

  if (!discordId || !reason?.trim()) {
    return Response.json({ error: "멤버와 내용을 입력해 주세요." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return Response.json({ error: "해당 멤버를 찾을 수 없습니다." }, { status: 404 });

  const id = `wrn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const resolvedType = resolveType(type);
  const resolvedIssuedBy = issuedBy?.trim() || "관리자";

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

  await syncWarningAutomation(user.id, guild.id).catch((error) => {
    console.error("[warnings] automation sync failed:", error);
  });

  const userWithGuilds = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      image: true,
      discordId: true,
      guilds: { select: { nickname: true }, take: 1 },
    },
  });

  return Response.json({
    warning: {
      id,
      userId: user.id,
      guildId: guild.id,
      reason: reason.trim(),
      note: note?.trim() || null,
      issuedBy: resolvedIssuedBy,
      active: true,
      type: resolvedType,
      createdAt: now,
      updatedAt: now,
      user: {
        name: userWithGuilds?.guilds[0]?.nickname ?? userWithGuilds?.name ?? null,
        image: userWithGuilds?.image ?? null,
        discordId: userWithGuilds?.discordId ?? null,
      },
    },
  });
}
