import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank } from "@/lib/rankFetcher";

type RiotRegion = "KR" | "AP";

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
    where: { cachedTierId: { gt: 0 }, user: { guilds: { some: {} } } },
    select: { puuid: true, cachedTierId: true, cachedTierName: true },
  });

  type RankEntry = { tierId: number; tierName: string; tierIcon?: string | null };
  type GuildAccount = { puuid: string; cachedTierId: number | null; cachedTierName: string | null };
  const puuidRankMap = new Map<string, RankEntry>(
    (guildMemberAccounts as GuildAccount[]).map((a) => [
      a.puuid,
      { tierId: a.cachedTierId as number, tierName: a.cachedTierName ?? "Unranked" },
    ])
  );

  // Populate tierIcons for the map entries
  await Promise.all(
    [...puuidRankMap.entries()].map(async ([puuid, entry]) => {
      const icon = await getRankIconByTier(entry.tierId).catch(() => null);
      puuidRankMap.set(puuid, { ...entry, tierIcon: icon });
    })
  );

  type AccountRow = { puuid: string; gameName: string; tagLine: string; region: string; accessToken: string | null; entitlementsToken: string | null; ssid: string | null; tokenExpiresAt: Date | null };
  const accountStats = await Promise.all(
    (accounts as AccountRow[]).map(async (account) => {
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
            const full = await getRankByPuuid(account.puuid, qRegion, {
              gameName: account.gameName,
              tagLine: account.tagLine,
            }).catch(() => null);
            if (full && r.tierId > 0 && full.tierId <= 0) {
              return { ...full, tierId: r.tierId, tierName: r.tierName, rankIcon: r.rankIcon };
            }
            return full;
          })
          .catch(() => null),
        getRecentMatches(account.puuid, 10, qRegion, "pc", {
          puuidRankMap,
          skipAccountFallback: true,
          skipRankFallback: true,
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
  );

  return Response.json({ accounts: accountStats });
}
