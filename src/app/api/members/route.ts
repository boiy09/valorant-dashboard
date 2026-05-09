import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTierName } from "@/lib/tierName";
import { getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank, fetchProfile } from "@/lib/rankFetcher";
import { ensureProfileColumns } from "@/lib/profileColumns";

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

  const guildDiscordId = req.nextUrl.searchParams.get("guildId") ?? process.env.DISCORD_GUILD_ID;
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) return Response.json({ members: [], guildName: null });

  await ensureProfileColumns();

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
          valorantRole: true,
          favoriteAgents: true,
          riotAccounts: {
            select: {
              puuid: true,
              gameName: true,
              tagLine: true,
              region: true,
              accessToken: true,
              entitlementsToken: true,
              ssid: true,
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

  const allAccounts = members.flatMap((m) => m.user.riotAccounts);

  await settleInBatches(allAccounts, 5, async (account) => {
    const region = toRegionLabel(account.region);
    const cacheAge = account.rankCachedAt ? now - account.rankCachedAt.getTime() : Infinity;
    const hasProfileData = account.cachedLevel !== null || account.cachedCard !== null;
    const isFresh = cacheAge < RANK_CACHE_TTL && account.cachedTierId !== null && hasProfileData;

    if (isFresh) {
      const rankIcon = account.cachedTierId
        ? await getRankIconByTier(account.cachedTierId).catch(() => null)
        : null;
      accountDetails.set(account.puuid, {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        level: account.cachedLevel,
        card: account.cachedCard,
        tier: normalizeTierName(account.cachedTierName, account.cachedTierId),
        rankIcon,
      });
      return;
    }

    const tokens = await ensureValidTokens(
      account.puuid,
      account.accessToken,
      account.entitlementsToken,
      account.ssid,
      account.tokenExpiresAt
    );

    const [rank, profile] = await Promise.all([
      fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens),
      fetchProfile(account.puuid, account.region, account.gameName, account.tagLine, tokens),
    ]);

    prisma.riotAccount.update({
      where: { puuid: account.puuid },
      data: {
        cachedTierId: rank.tierId,
        cachedTierName: rank.tierName,
        cachedLevel: profile.level,
        cachedCard: profile.card,
        rankCachedAt: new Date(),
      },
    }).catch(() => {});

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
    members: members.map((member) => ({
      id: member.id,
      name: member.nickname ?? member.user.name,
      image: member.user.image,
      discordId: member.user.discordId,
      roles: member.roles ? member.roles.split(",").filter(Boolean) : [],
      riotId: member.user.riotGameName
        ? `${member.user.riotGameName}#${member.user.riotTagLine}`
        : null,
      valorantRole: member.user.valorantRole,
      favoriteAgents: member.user.favoriteAgents
        ? member.user.favoriteAgents.split(",").map((agent) => agent.trim()).filter(Boolean).slice(0, 3)
        : [],
      riotAccounts: member.user.riotAccounts.map((account) => accountDetails.get(account.puuid) ?? {
        region: toRegionLabel(account.region),
        riotId: `${account.gameName}#${account.tagLine}`,
        level: null,
        card: null,
        tier: "언랭크",
        rankIcon: null,
      }),
      isOnline: member.isOnline,
      joinedAt: member.joinedAt,
    })),
  });
}
