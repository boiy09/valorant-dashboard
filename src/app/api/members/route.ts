import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlayerByRiotId, getRankByPuuid, getRankIconByTier, type ValorantRegion } from "@/lib/valorant";

function toValorantRegion(region: string): ValorantRegion {
  return region.toUpperCase() === "AP" ? "ap" : "kr";
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

  const RANK_CACHE_TTL = 2 * 60 * 60 * 1000; // 2시간
  const now = Date.now();

  const allAccounts = members.flatMap((member) => member.user.riotAccounts);
  await settleInBatches(allAccounts, 3, async (account) => {
    const region = account.region.toUpperCase() === "AP" ? "AP" : "KR";
    const cacheAge = account.rankCachedAt ? now - account.rankCachedAt.getTime() : Infinity;
    const isFresh = cacheAge < RANK_CACHE_TTL && account.cachedTierId !== null;

    if (isFresh) {
      const rankIcon = account.cachedTierId ? await getRankIconByTier(account.cachedTierId).catch(() => null) : null;
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

    const [profile, rank] = await Promise.all([
      getPlayerByRiotId(account.gameName, account.tagLine).catch(() => null),
      getRankByPuuid(account.puuid, toValorantRegion(region), {
        gameName: account.gameName,
        tagLine: account.tagLine,
      }).catch(() => null),
    ]);

    const level = profile && profile.accountLevel >= 0 ? profile.accountLevel : null;
    const card = profile?.card ?? null;
    const tierId = rank?.tierId ?? 0;

    prisma.riotAccount.update({
      where: { puuid: account.puuid },
      data: {
        cachedTierId: tierId,
        cachedTierName: rank?.tierName ?? "언랭크",
        cachedLevel: level,
        cachedCard: card,
        rankCachedAt: new Date(),
      },
    }).catch(() => {});

    accountDetails.set(account.puuid, {
      region,
      riotId: `${account.gameName}#${account.tagLine}`,
      level,
      card,
      tier: rank?.tierName ?? "언랭크",
      rankIcon: rank?.rankIcon ?? null,
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
      riotAccounts: member.user.riotAccounts.map((account) => accountDetails.get(account.puuid) ?? {
        region: account.region.toUpperCase() === "AP" ? "AP" : "KR",
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
