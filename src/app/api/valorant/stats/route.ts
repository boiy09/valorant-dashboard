import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank } from "@/lib/rankFetcher";

type RiotRegion = "KR" | "AP";
type PuuidRankEntry = {
  tierId: number;
  tierName: string;
  tierIcon: string | null | undefined;
};

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

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await findUser(session.user.id!, session.user.email);
  const accounts = user?.riotAccounts ?? [];

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
        getRecentMatches(account.puuid, 10, qRegion, "pc", {
          puuidRankMap: puuidRankMapRaw,
          skipAccountFallback: true,
        }).catch(() => []),
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
