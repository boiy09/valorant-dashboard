import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, getRankIconByTier, type MatchStats, type RankData } from "@/lib/valorant";
import { ensureTokenState, fetchRank } from "@/lib/rankFetcher";
import { getPrivateRankData, getPrivateRecentMatches } from "@/lib/riotPrivateApi";
import { apiCache, TTL } from "@/lib/apiCache";

type RiotRegion = "KR" | "AP";
type PuuidRankEntry = {
  tierId: number;
  tierName: string;
  tierIcon: string | null | undefined;
};
const recentMatchesLastGood = new Map<string, MatchStats[]>();
const rankLastGood = new Map<string, RankData>();

type RecentMatchSource = "cache" | "private" | "henrik" | "stale" | "empty";
type RecentMatchResult = {
  matches: MatchStats[];
  source: RecentMatchSource;
  message?: string;
};

function mergeCurrentRank(full: RankData | null, current: { tierId: number; tierName: string; rankIcon: string | null }): RankData | null {
  if (current.tierId <= 0) return full;

  if (!full) {
    return {
      tier: current.tierName,
      tierName: current.tierName,
      tierId: current.tierId,
      rr: null,
      rrChange: null,
      isCurrent: true,
      peakTier: "기록 없음",
      peakTierName: "기록 없음",
      wins: 0,
      games: 0,
      rankIcon: current.rankIcon,
      peakRankIcon: null,
      currentSeason: null,
      previousSeason: null,
      peakSeason: null,
    };
  }

  return {
    ...full,
    tier: current.tierName,
    tierName: current.tierName,
    tierId: current.tierId,
    rankIcon: current.rankIcon ?? full.rankIcon,
    isCurrent: true,
  };
}

function hasRankHistory(rank: RankData | null) {
  return Boolean(rank?.currentSeason || rank?.previousSeason || rank?.peakSeason || (rank?.peakTierName && rank.peakTierName !== "기록 없음"));
}

async function getRankCached(
  puuid: string,
  region: RiotRegion,
  gameName: string,
  tagLine: string,
  tokens: { accessToken: string; entitlementsToken: string } | null
) {
  const qRegion = toQueryRegion(region);
  const cacheKey = `valorant:rank:${qRegion}:${puuid}`;
  const staleRank = rankLastGood.get(cacheKey) ?? apiCache.getStale<RankData>(cacheKey)?.data ?? null;

  try {
    const current = await fetchRank(puuid, region, gameName, tagLine, tokens);
    const privateFull = tokens
      ? await getPrivateRankData(puuid, region, tokens.accessToken, tokens.entitlementsToken).catch(() => null)
      : null;
    const full = privateFull ?? await getRankByPuuid(puuid, qRegion, { gameName, tagLine }).catch(() => staleRank);
    const merged = mergeCurrentRank(full, current);

    if (merged && (hasRankHistory(merged) || current.tierId > 0)) {
      apiCache.set(cacheKey, merged);
      if (hasRankHistory(merged)) rankLastGood.set(cacheKey, merged);
    }

    return merged;
  } catch (error) {
    if (staleRank) {
      console.warn("[stats] rank failed, using stale rank:", error);
      return staleRank;
    }
    return null;
  }
}

function toQueryRegion(region: RiotRegion): "kr" | "ap" {
  return region === "AP" ? "ap" : "kr";
}

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: { riotAccounts: { orderBy: [{ region: "asc" }, { createdAt: "asc" }] } },
  });
  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      include: { riotAccounts: { orderBy: [{ region: "asc" }, { createdAt: "asc" }] } },
    });
  }
  return user;
}

async function getRecentMatchesCached(
  puuid: string,
  region: "kr" | "ap",
  puuidRankMap: Map<string, PuuidRankEntry>,
  force: boolean,
  tokens?: { accessToken: string; entitlementsToken: string } | null
): Promise<RecentMatchResult> {
  const cacheKey = `valorant:recent-matches:${region}:${puuid}:10`;
  const cached = apiCache.get<MatchStats[]>(cacheKey, TTL.MEDIUM);
  const cacheAge = apiCache.cacheAge(cacheKey);
  if (cached && (!force || cacheAge < 30 * 1000)) return { matches: cached, source: "cache" };

  try {
    const privateMatches = tokens
      ? await getPrivateRecentMatches(puuid, region, tokens.accessToken, tokens.entitlementsToken, { count: 10 }).catch(() => [])
      : [];
    const matches = privateMatches.length > 0
      ? privateMatches
      : await getRecentMatches(puuid, 10, region, "pc", {
          puuidRankMap,
          skipAccountFallback: true,
        });
    if (matches.length > 0) {
      apiCache.set(cacheKey, matches);
      recentMatchesLastGood.set(cacheKey, matches);
    }
    return {
      matches,
      source: privateMatches.length > 0 ? "private" : matches.length > 0 ? "henrik" : "empty",
      message: matches.length > 0 ? undefined : "PVP/Henrik 모두 최근 매치 데이터를 반환하지 않았습니다.",
    };
  } catch (error) {
    const stale = recentMatchesLastGood.get(cacheKey);
    if (stale) {
      console.warn("[stats] recent matches failed, using cached data:", error);
      return { matches: stale, source: "stale", message: "최근 매치 조회 실패로 마지막 성공 데이터를 사용했습니다." };
    }
    const staleCache = apiCache.getStale<MatchStats[]>(cacheKey);
    if (staleCache?.data?.length) {
      console.warn("[stats] recent matches failed, using stale cache:", error);
      return { matches: staleCache.data, source: "stale", message: "최근 매치 조회 실패로 만료 캐시를 사용했습니다." };
    }
    return {
      matches: [],
      source: "empty",
      message: error instanceof Error ? error.message : "최근 매치 조회에 실패했습니다.",
    };
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await findUser(session.user.id!, session.user.email);
  const forceRegion = req.nextUrl.searchParams.get("forceRegion")?.toUpperCase();
  const accounts = (user?.riotAccounts ?? []).filter((account) => {
    if (forceRegion !== "KR" && forceRegion !== "AP") return true;
    return account.region.toUpperCase() === forceRegion;
  });

  // Build puuidRankMap from DB for all guild members — used for scoreboard rank display
  const guildMemberAccounts = await prisma.riotAccount.findMany({
    where: {
      cachedTierId: { not: null, gt: 0 },
      user: { guilds: { some: {} } },
    },
    select: { puuid: true, cachedTierId: true, cachedTierName: true },
  });

  const puuidRankMapRaw = new Map<string, PuuidRankEntry>(
    guildMemberAccounts.map((a) => [
      a.puuid,
      { tierId: a.cachedTierId!, tierName: a.cachedTierName ?? "Unranked", tierIcon: undefined as string | null | undefined },
    ])
  );

  // Populate tierIcons for the map entries — 개별 실패가 전체 응답을 막지 않도록 격리
  await Promise.allSettled(
    [...puuidRankMapRaw.entries()].map(async ([puuid, entry]) => {
      const icon = await getRankIconByTier(entry.tierId).catch(() => null);
      puuidRankMapRaw.set(puuid, { ...entry, tierIcon: icon });
    })
  );

  const relinkAccounts: Array<{
    region: RiotRegion;
    riotId: string;
    reason: string;
    message: string;
  }> = [];

  const accountStats = (await Promise.allSettled(
    accounts.map(async (account) => {
      const region = account.region as RiotRegion;
      const qRegion = toQueryRegion(region);

      const tokenState = await ensureTokenState(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.authCookie,
        account.tokenExpiresAt
      );
      const tokens = tokenState.tokens;

      if (tokenState.needsRelink) {
        relinkAccounts.push({
          region,
          riotId: `${account.gameName}#${account.tagLine}`,
          reason: tokenState.reason ?? "refresh_failed",
          message: tokenState.message ?? "Riot 계정을 다시 연동해 주세요.",
        });
      }

      const [rank, recentMatchResult] = await Promise.all([
        getRankCached(account.puuid, region, account.gameName, account.tagLine, tokens),
        getRecentMatchesCached(account.puuid, qRegion, puuidRankMapRaw, forceRegion === region, tokens),
      ]);

      return {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
        rank,
        matchSource: recentMatchResult.source,
        matchMessage: recentMatchResult.message,
        recentMatches: recentMatchResult.matches.map((m) => ({
          ...m,
          playedAt: m.playedAt.toISOString(),
        })),
      };
    })
  )).flatMap((r) => {
    if (r.status === "fulfilled") return [r.value];
    console.error("[stats] account stats fetch failed:", r.reason);
    return [];
  });

  return Response.json({
    accounts: accountStats,
    riotAuth: {
      needsRelink: relinkAccounts.length > 0,
      accounts: relinkAccounts,
    },
  });
}
