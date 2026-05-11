import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const reactionSyncCache = new Map<string, number>();

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

function parseSettings(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureColumns() {
  await Promise.all([
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3)`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentChannelId" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentMessageIds" TEXT NOT NULL DEFAULT ''`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "managers" TEXT NOT NULL DEFAULT ''`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimPlayer" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'participant'`),
    prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'normal'`),
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

function getDiscordHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return { Authorization: `Bot ${token}` };
}

function encodeReactionEmoji(reaction: { emoji?: { id?: string | null; name?: string | null } }) {
  const name = reaction.emoji?.name;
  if (!name) return null;
  return encodeURIComponent(reaction.emoji?.id ? `${name}:${reaction.emoji.id}` : name);
}

async function fetchDiscordJson<T>(url: string): Promise<T | null> {
  const headers = getDiscordHeaders();
  if (!headers) return null;

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

async function syncRecruitmentReactions(scrim: NonNullable<Awaited<ReturnType<typeof findScrim>>>) {
  if (!scrim.recruitmentChannelId) return;

  const messageIds = parseIdList(scrim.recruitmentMessageIds);
  if (messageIds.length === 0) return;

  const lastSynced = reactionSyncCache.get(scrim.id) ?? 0;
  if (Date.now() - lastSynced < 15_000) return;
  reactionSyncCache.set(scrim.id, Date.now());

  for (const messageId of messageIds) {
    const message = await fetchDiscordJson<{
      reactions?: Array<{ count?: number; emoji?: { id?: string | null; name?: string | null } }>;
    }>(`https://discord.com/api/v10/channels/${scrim.recruitmentChannelId}/messages/${messageId}`);

    for (const reaction of message?.reactions ?? []) {
      if (!reaction.count || reaction.count <= 0) continue;

      const emoji = encodeReactionEmoji(reaction);
      if (!emoji) continue;

      const users = await fetchDiscordJson<
        Array<{ id: string; username?: string; global_name?: string | null; avatar?: string | null; bot?: boolean }>
      >(`https://discord.com/api/v10/channels/${scrim.recruitmentChannelId}/messages/${messageId}/reactions/${emoji}?limit=100`);

      for (const discordUser of users ?? []) {
        if (!discordUser.id || discordUser.bot) continue;

        const avatarUrl = discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null;
        const appUser = await prisma.user.upsert({
          where: { discordId: discordUser.id },
          update: {
            name: discordUser.global_name ?? discordUser.username ?? "Discord User",
            image: avatarUrl ?? undefined,
          },
          create: {
            discordId: discordUser.id,
            email: `${discordUser.id}@discord`,
            name: discordUser.global_name ?? discordUser.username ?? "Discord User",
            image: avatarUrl,
          },
        });

        await prisma.scrimPlayer.upsert({
          where: { sessionId_userId: { sessionId: scrim.id, userId: appUser.id } },
          update: {},
          create: {
            sessionId: scrim.id,
            userId: appUser.id,
            team: "participant",
            role: "participant",
          },
        });
      }
    }
  }
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  await ensureColumns();
  const { session, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await context.params;
  const scrim = await findScrim(id, guild?.id);
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  await syncRecruitmentReactions(scrim).catch((error) => {
    console.error("내전 모집 반응 동기화 오류:", error);
  });

  const syncedScrim = await findScrim(id, guild?.id);
  if (!syncedScrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

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
    scrim: syncedScrim,
    managerIds: parseIdList(syncedScrim.managers || syncedScrim.createdBy),
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

  if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    const currentSettings = parseSettings(scrim.settings);
    await prisma.scrimSession.update({
      where: { id: scrim.id },
      data: { settings: JSON.stringify({ ...currentSettings, ...body.settings }) },
    });
  }

  const nextScrim = await findScrim(scrim.id, guild.id);
  return Response.json({ success: true, scrim: nextScrim });
}
