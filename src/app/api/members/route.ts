import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank, fetchProfile } from "@/lib/rankFetcher";

type MemberAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  accessToken: string | null;
  entitlementsToken: string | null;
  ssid: string | null;
  authCookie: string | null;
  tokenExpiresAt: Date | null;
  cachedTierId: number | null;
  cachedTierName: string | null;
  cachedLevel: number | null;
  cachedCard: string | null;
  rankCachedAt: Date | null;
};

type MemberRow = {
  id: string;
  userId: string;
  nickname: string | null;
  roles: string;
  isOnline: boolean;
  joinedAt: Date;
  user: {
    name: string | null;
    image: string | null;
    discordId: string | null;
    riotGameName: string | null;
    riotTagLine: string | null;
    riotAccounts: MemberAccount[];
  };
};

type VoiceActivitySummary = {
  isActive: boolean;
  channelName: string;
  joinedAt: Date;
  leftAt: Date | null;
  duration: number | null;
};

function toRegionLabel(region: string) {
  return region.toUpperCase() === "AP" ? "AP" : "KR";
}

async function settleInBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(task))));
  }
  return results;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const guildDiscordId = req.nextUrl.searchParams.get("guildId") ?? process.env.DISCORD_GUILD_ID;
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) return Response.json({ members: [], guildName: null });

  const members = await prisma.guildMember.findMany({
    where: { guildId: guild.id },
    include: {
      user: {
        select: {
          name: true,
          image: true,
          discordId: true,
          riotGameName: true,
          riotTagLine: true,
          riotAccounts: {
            select: {
              puuid: true,
              gameName: true,
              tagLine: true,
              region: true,
              accessToken: true,
              entitlementsToken: true,
              ssid: true,
              authCookie: true,
              tokenExpiresAt: true,
              cachedTierId: true,
              cachedTierName: true,
              cachedLevel: true,
              cachedCard: true,
              rankCachedAt: true,
            },
            orderBy: { region: "asc" },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const accountDetails = new Map<string, {
    region: string;
    riotId: string;
    level: number | null;
    card: string | null;
    tier: string;
    rankIcon: string | null;
  }>();

  const RANK_CACHE_TTL = 2 * 60 * 60 * 1000;
  const now = Date.now();

  const memberRows = members as MemberRow[];
  const allAccounts = memberRows.flatMap((m) => m.user.riotAccounts);
  const memberUserIds = memberRows.map((member) => member.userId);

  const voiceActivities = await prisma.voiceActivity.findMany({
    where: {
      guildId: guild.id,
      userId: { in: memberUserIds },
    },
    select: {
      userId: true,
      channelName: true,
      joinedAt: true,
      leftAt: true,
      duration: true,
    },
    orderBy: { joinedAt: "desc" },
  });

  const latestVoiceActivityByUserId = new Map<string, VoiceActivitySummary>();
  for (const activity of voiceActivities) {
    if (latestVoiceActivityByUserId.has(activity.userId)) continue;
    latestVoiceActivityByUserId.set(activity.userId, {
      isActive: activity.leftAt === null,
      channelName: activity.channelName,
      joinedAt: activity.joinedAt,
      leftAt: activity.leftAt,
      duration: activity.duration,
    });
  }

  await settleInBatches(allAccounts, 5, async (account) => {
    const region = toRegionLabel(account.region);
    const cacheAge = account.rankCachedAt ? now - account.rankCachedAt.getTime() : Infinity;
    const hasProfileData = account.cachedLevel !== null || account.cachedCard !== null;
    const isFresh = !force && cacheAge < RANK_CACHE_TTL && account.cachedTierId !== null && hasProfileData;

    if (isFresh) {
      const rankIcon = account.cachedTierId
        ? await getRankIconByTier(account.cachedTierId).catch(() => null)
        : null;
      accountDetails.set(account.puuid, {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        level: account.cachedLevel,
        card: account.cachedCard,
        tier: account.cachedTierName ?? "언랭크",
        rankIcon,
      });
      return;
    }

    const tokens = await ensureValidTokens(
      account.puuid,
      account.accessToken,
      account.entitlementsToken,
      account.ssid,
      account.authCookie,
      account.tokenExpiresAt
    );

    const [rank, profile] = await Promise.all([
      fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens),
      fetchProfile(account.puuid, account.region, account.gameName, account.tagLine, tokens),
    ]);

    await prisma.riotAccount.update({
      where: { puuid: account.puuid },
      data: {
        cachedTierId: rank.tierId,
        cachedTierName: rank.tierName,
        cachedLevel: profile.level,
        cachedCard: profile.card,
        rankCachedAt: new Date(),
      },
    }).catch((e: unknown) => console.error("[members] rank cache update failed:", account.puuid, e));

    accountDetails.set(account.puuid, {
      region,
      riotId: `${account.gameName}#${account.tagLine}`,
      level: profile.level,
      card: profile.card,
      tier: rank.tierName,
      rankIcon: rank.rankIcon,
    });
  });

  return Response.json({
    guildName: guild.name,
    members: memberRows.map((member) => ({
      id: member.id,
      name: member.nickname ?? member.user.name,
      image: member.user.image,
      discordId: member.user.discordId,
      roles: member.roles ? member.roles.split(",").filter(Boolean) : [],
      riotId: member.user.riotGameName
        ? `${member.user.riotGameName}#${member.user.riotTagLine}`
        : null,
      riotAccounts: member.user.riotAccounts.map((account) => accountDetails.get(account.puuid) ?? {
        region: toRegionLabel(account.region),
        riotId: `${account.gameName}#${account.tagLine}`,
        level: null,
        card: null,
        tier: "언랭크",
        rankIcon: null,
      }),
      isOnline: member.isOnline,
      voiceActivity: latestVoiceActivityByUserId.get(member.userId) ?? null,
      joinedAt: member.joinedAt,
    })),
  });
}
