import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function parseIdList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function stringifyIdList(values: string[]) {
  return JSON.stringify(Array.from(new Set(values.filter(Boolean))).slice(0, 5));
}

async function ensureColumns() {
  await Promise.all([
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3)`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentChannelId" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentMessageIds" TEXT NOT NULL DEFAULT ''`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "managers" TEXT NOT NULL DEFAULT ''`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimPlayer" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'participant'`),
  ]);
}

async function findScrim(id: string, guildId?: string) {
  return prisma.scrimSession.findFirst({
    where: { id, ...(guildId ? { guildId } : {}) },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              discordId: true,
              name: true,
              image: true,
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
              valorantRole: true,
              favoriteAgents: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureColumns();
  const { session, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await context.params;
  const scrim = await findScrim(id, guild?.id);
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const guildMembers = guild
    ? await prisma.guildMember.findMany({
        where: { guildId: guild.id },
        include: {
          user: { select: { discordId: true, name: true, image: true } },
        },
        orderBy: { nickname: "asc" },
      })
    : [];

  return Response.json({
    scrim,
    managerIds: parseIdList(scrim.managers || scrim.createdBy),
    guildMembers: guildMembers.map((member) => ({
      userId: member.userId,
      discordId: member.user.discordId,
      name: member.nickname ?? member.user.name,
      image: member.user.image,
    })),
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureColumns();
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const currentManagers = parseIdList(scrim.managers || scrim.createdBy);
  if (!isAdmin && !currentManagers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates = Array.isArray(body.players) ? body.players : [];
  for (const update of updates) {
    if (!update?.id || typeof update.team !== "string" || typeof update.role !== "string") continue;
    await prisma.scrimPlayer.updateMany({
      where: { id: update.id, sessionId: scrim.id },
      data: {
        team: update.team,
        role: update.role,
      },
    });
  }

  if (Array.isArray(body.managerIds)) {
    await prisma.scrimSession.update({
      where: { id: scrim.id },
      data: { managers: stringifyIdList(body.managerIds) },
    });
  }

  const nextScrim = await findScrim(scrim.id, guild.id);
  return Response.json({ success: true, scrim: nextScrim });
}
