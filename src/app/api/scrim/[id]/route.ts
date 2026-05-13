import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getRecentMatches, type ValorantRegion } from "@/lib/valorant";
import { apiCache, TTL } from "@/lib/apiCache";

const reactionSyncCache = new Map<string, number>();

type GuildMemberRow = {
  userId: string;
  nickname: string | null;
  user: {
    discordId: string | null;
    name: string | null;
    image: string | null;
  };
};

type KdaSnapshotPlayer = {
  userId?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
};

type KdSummary = {
  source: "scrim" | "rank";
  kd: number;
  kills: number;
  deaths: number;
  matches: number;
};

type ScrimGameKdaRow = {
  kdaSnapshot: string | null;
};

function parseIdList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

async function settleInBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(task))));
  }
  return results;
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
                  puuid: true,
                  region: true,
                  isPrimary: true,
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

function buildKdSummary(source: KdSummary["source"], kills: number, deaths: number, matches: number): KdSummary | null {
  if (matches <= 0) return null;
  return {
    source,
    kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
    kills,
    deaths,
    matches,
  };
}

async function getScrimKdSummaries(guildId: string) {
  const games = await prisma.$queryRaw<ScrimGameKdaRow[]>`
    SELECT g."kdaSnapshot"
    FROM "ScrimGame" g
    INNER JOIN "ScrimSession" s ON s."id" = g."sessionId"
    WHERE s."guildId" = ${guildId}
  `;

  const stats = new Map<string, { kills: number; deaths: number; matches: number }>();
  for (const game of games) {
    let kdaList: KdaSnapshotPlayer[] = [];
    try {
      kdaList = game.kdaSnapshot ? JSON.parse(game.kdaSnapshot) : [];
    } catch {
      continue;
    }

    for (const player of kdaList) {
      if (!player.userId) continue;
      const current = stats.get(player.userId) ?? { kills: 0, deaths: 0, matches: 0 };
      current.kills += Number(player.kills ?? 0);
      current.deaths += Number(player.deaths ?? 0);
      current.matches += 1;
      stats.set(player.userId, current);
    }
  }

  return new Map(
    Array.from(stats.entries()).flatMap(([userId, value]) => {
      const summary = buildKdSummary("scrim", value.kills, value.deaths, value.matches);
      return summary ? [[userId, summary]] : [];
    })
  );
}

async function getRankKdSummary(
  accounts: Array<{ puuid: string; region: string; isPrimary: boolean; gameName: string; tagLine: string }>
) {
  const account =
    accounts.find((item) => item.isPrimary) ??
    accounts.find((item) => item.region.toUpperCase() === "KR") ??
    accounts[0];
  if (!account?.puuid) return null;

  const region = account.region.toLowerCase() === "ap" ? "ap" : "kr";
  const cacheKey = `scrim-card-rank-kd:${account.puuid}:${region}`;

  const { data } = await apiCache.getOrFetch(cacheKey, TTL.MEDIUM, async () => {
    const matches = await getRecentMatches(
      account.puuid,
      20,
      region as ValorantRegion,
      "pc",
      { skipAccountFallback: true, skipRankFallback: true }
    ).catch(() => []);

    const competitiveMatches = matches.filter((match) => {
      const mode = match.mode.toLowerCase();
      return mode.includes("competitive") || mode.includes("rank") || mode.includes("경쟁");
    });
    const targetMatches = competitiveMatches.length > 0 ? competitiveMatches : matches;
    const kills = targetMatches.reduce((sum, match) => sum + match.kills, 0);
    const deaths = targetMatches.reduce((sum, match) => sum + match.deaths, 0);

    return buildKdSummary("rank", kills, deaths, targetMatches.length);
  });

  return data;
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

  const dbGuild = await prisma.guild.findUnique({ where: { id: scrim.guildId }, select: { discordId: true } });

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

        // GuildMember 레코드 생성/업데이트로 서버 닉네임 동기화
        if (dbGuild?.discordId) {
          const gm = await fetchDiscordJson<{ nick?: string | null }>(
            `https://discord.com/api/v10/guilds/${dbGuild.discordId}/members/${discordUser.id}`
          );
          await prisma.guildMember.upsert({
            where: { userId_guildId: { userId: appUser.id, guildId: scrim.guildId } },
            update: { nickname: gm?.nick ?? null },
            create: {
              userId: appUser.id,
              guildId: scrim.guildId,
              nickname: gm?.nick ?? null,
            },
          });
        }
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
  const scrimKdSummaries = await getScrimKdSummaries(syncedScrim.guildId);
  const missingRankPlayers = syncedScrim.players.filter((player) => !scrimKdSummaries.has(player.userId));
  const rankKdSummaries = new Map<string, KdSummary>();

  await settleInBatches(missingRankPlayers, 3, async (player) => {
    const summary = await getRankKdSummary(player.user.riotAccounts);
    if (summary) rankKdSummaries.set(player.userId, summary);
  });

  return Response.json({
    scrim: {
      ...syncedScrim,
      players: syncedScrim.players.map((player) => ({
        ...player,
        kdSummary: scrimKdSummaries.get(player.userId) ?? rankKdSummaries.get(player.userId) ?? null,
      })),
    },
    managerIds: parseIdList(syncedScrim.managers || syncedScrim.createdBy),
    guildMembers: (guildMembers as GuildMemberRow[]).map((member) => ({
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

  // 팀/역할 업데이트
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

  // KDA 업데이트
  const kdaUpdates = Array.isArray(body.kdaPlayers) ? body.kdaPlayers : [];
  for (const kda of kdaUpdates) {
    if (!kda?.id) continue;
    await prisma.scrimPlayer.updateMany({
      where: { id: kda.id, sessionId: scrim.id },
      data: {
        kills: typeof kda.kills === "number" ? kda.kills : undefined,
        deaths: typeof kda.deaths === "number" ? kda.deaths : undefined,
        assists: typeof kda.assists === "number" ? kda.assists : undefined,
      },
    });
  }

  // 참가자 제거
  if (typeof body.removePlayerId === "string" && body.removePlayerId) {
    await prisma.scrimPlayer.deleteMany({
      where: { id: body.removePlayerId, sessionId: scrim.id },
    });
  }

  // 매니저 업데이트
  if (Array.isArray(body.managerIds)) {
    await prisma.scrimSession.update({
      where: { id: scrim.id },
      data: { managers: stringifyIdList(body.managerIds) },
    });
  }

  // 세션 상태/결과/맵 업데이트
  const sessionUpdate: Record<string, unknown> = {};
  const VALID_STATUSES = ["waiting", "recruiting", "playing", "done"];
  const VALID_WINNERS = ["team_a", "team_b", "draw", null];
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) {
    sessionUpdate.status = body.status;
    if (body.status === "playing" && !scrim.startedAt) sessionUpdate.startedAt = new Date();
    if (body.status === "done" && !scrim.endedAt) sessionUpdate.endedAt = new Date();
  }
  if (body.winnerId !== undefined && VALID_WINNERS.includes(body.winnerId as string | null)) {
    sessionUpdate.winnerId = body.winnerId as string | null;
  }
  if (typeof body.map === "string") {
    sessionUpdate.map = body.map || null;
  }
  if (Object.keys(sessionUpdate).length > 0) {
    await prisma.scrimSession.update({ where: { id: scrim.id }, data: sessionUpdate });
  }

  // 설정 업데이트
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
