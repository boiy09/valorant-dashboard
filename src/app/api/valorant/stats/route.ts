import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTierName } from "@/lib/tierName";
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

/**
 * 활성 내전 세션들의 참가자 PUUID 목록을 가져온다.
 * 각 세션별로 { sessionId, title, puuids[] } 형태로 반환.
 * 상태가 "waiting" | "recruiting" | "playing" | "done" 모두 포함 (최근 30일 이내).
 */
async function getScrimSessionPuuidSets(): Promise<
  Array<{ sessionId: string; title: string; puuids: Set<string>; scheduledAt: Date | null }>
> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 최근 30일
  const sessions = await prisma.scrimSession.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      players: {
        select: {
          user: {
            select: {
              riotAccounts: { select: { puuid: true } },
            },
          },
        },
      },
    },
  });

  return sessions
    .map((session) => {
      const puuids = new Set<string>();
      for (const player of session.players) {
        for (const account of player.user.riotAccounts) {
          if (account.puuid) puuids.add(account.puuid);
        }
      }
      return {
        sessionId: session.id,
        title: session.title,
        puuids,
        scheduledAt: session.scheduledAt,
      };
    })
    .filter((s) => s.puuids.size > 0); // 참가자가 있는 세션만
}

/**
 * 커스텀 매치의 스코어보드 PUUID 목록과 내전 세션 참가자 PUUID를 비교하여
 * 해당 매치가 어느 내전 세션인지 반환. 없으면 null.
 * 조건: 내전 참가자 PUUID 전원이 매치에 포함되어야 함.
 */
function matchScrimSession(
  matchPlayerPuuids: string[],
  scrimSessions: Array<{ sessionId: string; title: string; puuids: Set<string>; scheduledAt: Date | null }>
): { sessionId: string; title: string } | null {
  const matchSet = new Set(matchPlayerPuuids);
  for (const session of scrimSessions) {
    if (session.puuids.size === 0) continue;
    // 내전 참가자 전원이 매치에 포함되어야 함
    const allPresent = [...session.puuids].every((puuid) => matchSet.has(puuid));
    if (allPresent) {
      return { sessionId: session.sessionId, title: session.title };
    }
  }
  return null;
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
      { tierId: a.cachedTierId as number, tierName: normalizeTierName(a.cachedTierName, a.cachedTierId) },
    ])
  );

  // Populate tierIcons for the map entries
  await Promise.all(
    [...puuidRankMap.entries()].map(async ([puuid, entry]) => {
      const icon = await getRankIconByTier(entry.tierId).catch(() => null);
      puuidRankMap.set(puuid, { ...entry, tierIcon: icon });
    })
  );

  // 내전 세션 참가자 PUUID 목록 미리 로드
  const scrimSessions = await getScrimSessionPuuidSets().catch(() => []);

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

      // 커스텀 매치 필터링: 내전 참가자 전원이 포함된 경우만 내전으로 인정
      const processedMatches = recentMatches
        .map((m) => {
          const isCustom =
            m.mode.toLowerCase().includes("custom") ||
            m.mode === "커스텀" ||
            m.mode === "Custom Game" ||
            m.mode === "모드 정보 없음"; // 커스텀은 종종 모드 정보가 없음

          if (!isCustom) {
            // 일반 매치는 그대로 통과
            return { ...m, playedAt: m.playedAt.toISOString(), scrimSessionId: null, scrimTitle: null };
          }

          // 커스텀 매치: 스코어보드 PUUID 추출
          const matchPlayerPuuids = (m.scoreboard?.players ?? [])
            .map((p) => p.puuid)
            .filter(Boolean);

          if (matchPlayerPuuids.length === 0) {
            // PUUID 정보 없으면 필터링
            return null;
          }

          // 내전 세션 매칭
          const matched = matchScrimSession(matchPlayerPuuids, scrimSessions);
          if (!matched) {
            // 내전으로 인정되지 않는 커스텀 매치 → 제외
            return null;
          }

          return {
            ...m,
            playedAt: m.playedAt.toISOString(),
            scrimSessionId: matched.sessionId,
            scrimTitle: matched.title,
          };
        })
        .filter(Boolean);

      return {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
        rank,
        recentMatches: processedMatches,
      };
    })
  );

  return Response.json({ accounts: accountStats });
}
