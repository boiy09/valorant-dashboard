import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, getRankIconByTier, type MatchStats } from "@/lib/valorant";
import { ensureValidTokens, fetchRank } from "@/lib/rankFetcher";
import { getPrivateRecentMatches } from "@/lib/riotPrivateApi";
import { apiCache, TTL } from "@/lib/apiCache";

type RiotRegion = "KR" | "AP";
type PuuidRankEntry = {
  tierId: number;
  tierName: string;
  tierIcon: string | null | undefined;
};
const recentMatchesLastGood = new Map<string, MatchStats[]>();

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
) {
  const cacheKey = `valorant:recent-matches:${region}:${puuid}:10`;
  const cached = apiCache.get<MatchStats[]>(cacheKey, TTL.MEDIUM);
  const cacheAge = apiCache.cacheAge(cacheKey);
  if (cached && (!force || cacheAge < 30 * 1000)) return cached;

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
    return matches;
  } catch (error) {
    const stale = recentMatchesLastGood.get(cacheKey);
    if (stale) {
      console.warn("[stats] recent matches failed, using cached data:", error);
      return stale;
    }
    const staleCache = apiCache.getStale<MatchStats[]>(cacheKey);
    if (staleCache?.data?.length) {
      console.warn("[stats] recent matches failed, using stale cache:", error);
      return staleCache.data;
    }
    throw error;
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

  const accountStats = (await Promise.allSettled(
    accounts.map(async (account) => {
      const region = account.region as RiotRegion;
      const qRegion = toQueryRegion(region);

      const tokens = await ensureValidTokens(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.tokenExpiresAt
      );

      const [rank, recentMatches] = await Promise.all([
        fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens)
          .then(async (r) => {
            // fetchRank returns a simplified rank; also get full Henrik rank for season data
            const full = await getRankByPuuid(account.puuid, qRegion, {
              gameName: account.gameName,
              tagLine: account.tagLine,
            }).catch(() => null);
            // Use Private API / tracker.gg tier if Henrik shows unranked
            if (full && r.tierId > 0 && full.tierId <= 0) {
              return { ...full, tierId: r.tierId, tierName: r.tierName, rankIcon: r.rankIcon };
            }
            return full;
          })
          .catch(() => null),
        getRecentMatchesCached(account.puuid, qRegion, puuidRankMapRaw, forceRegion === region, tokens).catch(() => []),
      ]);

      return {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
        rank,
        recentMatches: recentMatches.map((m) => ({
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

  return Response.json({ accounts: accountStats });
}
