import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank } from "@/lib/rankFetcher";

const REGION_LABELS = {
  KR: "한섭",
  AP: "아섭",
} as const;

const MAJOR_TIERS = [
  ["IRON", "아이언", "#6b7280"],
  ["BRONZE", "브론즈", "#b16a3a"],
  ["SILVER", "실버", "#a8b3c7"],
  ["GOLD", "골드", "#f3b33d"],
  ["PLATINUM", "플래티넘", "#24c6b8"],
  ["DIAMOND", "다이아몬드", "#b66dff"],
  ["ASCENDANT", "초월자", "#22c55e"],
  ["IMMORTAL", "불멸", "#e11d48"],
] as const;

const DETAIL_TIERS = [
  "UNRANKED",
  ...MAJOR_TIERS.flatMap(([key]) => [`${key}_1`, `${key}_2`, `${key}_3`]),
  "RADIANT",
] as const;

type DetailTier = (typeof DETAIL_TIERS)[number];
type Region = "KR" | "AP";

interface TierMember {
  name: string;
  riotId: string;
  image: string | null;
  discordId: string | null;
}

const TIER_IDS: Record<DetailTier, number> = {
  UNRANKED: 0,
  IRON_1: 3,
  IRON_2: 4,
  IRON_3: 5,
  BRONZE_1: 6,
  BRONZE_2: 7,
  BRONZE_3: 8,
  SILVER_1: 9,
  SILVER_2: 10,
  SILVER_3: 11,
  GOLD_1: 12,
  GOLD_2: 13,
  GOLD_3: 14,
  PLATINUM_1: 15,
  PLATINUM_2: 16,
  PLATINUM_3: 17,
  DIAMOND_1: 18,
  DIAMOND_2: 19,
  DIAMOND_3: 20,
  ASCENDANT_1: 21,
  ASCENDANT_2: 22,
  ASCENDANT_3: 23,
  IMMORTAL_1: 24,
  IMMORTAL_2: 25,
  IMMORTAL_3: 26,
  RADIANT: 27,
};

const TIER_META = Object.fromEntries([
  ["UNRANKED", { label: "언랭크", color: "#64748b" }],
  ...MAJOR_TIERS.flatMap(([key, label, color]) =>
    [1, 2, 3].map((division) => [`${key}_${division}`, { label: `${label} ${division}`, color }])
  ),
  ["RADIANT", { label: "레디언트", color: "#f8fafc" }],
]) as Record<DetailTier, { label: string; color: string }>;

const TIER_ID_TO_KEY = Object.fromEntries(
  Object.entries(TIER_IDS).map(([key, id]) => [id, key as DetailTier])
) as Record<number, DetailTier>;

function tierIdToDetailTier(tierId: number): DetailTier {
  return TIER_ID_TO_KEY[tierId] ?? "UNRANKED";
}

function createTierCountMap() {
  return Object.fromEntries(DETAIL_TIERS.map((tier) => [tier, 0])) as Record<DetailTier, number>;
}

function createTierMemberMap() {
  return Object.fromEntries(DETAIL_TIERS.map((tier) => [tier, [] as TierMember[]])) as Record<DetailTier, TierMember[]>;
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

  if (!guild) {
    return Response.json({
      regions: await buildEmptyRegions(),
      generatedAt: new Date().toISOString(),
    });
  }

  const rankCacheTtl = 2 * 60 * 60 * 1000;
  const now = Date.now();

  const accounts = await prisma.riotAccount.findMany({
    where: {
      region: { in: ["KR", "AP"] },
      user: { guilds: { some: { guildId: guild.id } } },
    },
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
      rankCachedAt: true,
      user: {
        select: {
          name: true,
          image: true,
          discordId: true,
          guilds: {
            where: { guildId: guild.id },
            select: { nickname: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ region: "asc" }, { gameName: "asc" }],
  });

  const rankedAccounts = await settleInBatches(accounts, 5, async (account) => {
    const region: Region = account.region.toUpperCase() === "AP" ? "AP" : "KR";
    const cacheAge = account.rankCachedAt ? now - account.rankCachedAt.getTime() : Infinity;
    const isFresh = cacheAge < rankCacheTtl && account.cachedTierId !== null;

    let tierId = account.cachedTierId ?? 0;
    if (!isFresh) {
      const tokens = await ensureValidTokens(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.tokenExpiresAt
      );
      const rank = await fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens);
      tierId = rank.tierId;

      prisma.riotAccount.update({
        where: { puuid: account.puuid },
        data: { cachedTierId: tierId, cachedTierName: rank.tierName, rankCachedAt: new Date() },
      }).catch(() => {});
    }

    const nickname = account.user.guilds[0]?.nickname;
    return {
      region,
      tier: tierIdToDetailTier(tierId),
      member: {
        name: nickname || account.user.name || account.gameName,
        riotId: `${account.gameName}#${account.tagLine}`,
        image: account.user.image,
        discordId: account.user.discordId,
      } satisfies TierMember,
    };
  });

  const countsByRegion = {
    KR: createTierCountMap(),
    AP: createTierCountMap(),
  };
  const membersByRegion = {
    KR: createTierMemberMap(),
    AP: createTierMemberMap(),
  };

  for (const account of rankedAccounts) {
    countsByRegion[account.region][account.tier] += 1;
    membersByRegion[account.region][account.tier].push(account.member);
  }

  return Response.json({
    regions: {
      KR: await buildRegion("KR", countsByRegion.KR, membersByRegion.KR),
      AP: await buildRegion("AP", countsByRegion.AP, membersByRegion.AP),
    },
    generatedAt: new Date().toISOString(),
  });
}

async function buildEmptyRegions() {
  const emptyCounts = createTierCountMap();
  const emptyMembers = createTierMemberMap();
  return {
    KR: await buildRegion("KR", emptyCounts, emptyMembers),
    AP: await buildRegion("AP", emptyCounts, emptyMembers),
  };
}

async function buildRegion(
  region: Region,
  counts: Record<DetailTier, number>,
  members: Record<DetailTier, TierMember[]>
) {
  const total = DETAIL_TIERS.reduce((sum, tier) => sum + counts[tier], 0);
  const tiers = await Promise.all(
    DETAIL_TIERS.map(async (tier) => ({
      key: tier,
      label: TIER_META[tier].label,
      color: TIER_META[tier].color,
      count: counts[tier],
      percent: total > 0 ? Math.round((counts[tier] / total) * 1000) / 10 : 0,
      icon: await getRankIconByTier(TIER_IDS[tier]),
      members: members[tier],
    }))
  );

  return {
    region,
    label: REGION_LABELS[region],
    total,
    tiers,
  };
}
