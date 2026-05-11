import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTierName } from "@/lib/tierName";
import { getRankByPuuid, getRecentMatches, getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchRank } from "@/lib/rankFetcher";

type RiotRegion = "KR" | "AP";

// 캐시 유효 시간: 30분
const CACHE_TTL_MS = 30 * 60 * 1000;

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

async function getScrimSessionPuuidSets(): Promise<
  Array<{ sessionId: string; title: string; puuids: Set<string>; scheduledAt: Date | null }>
> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
    .filter((s) => s.puuids.size > 0);
}

function matchScrimSession(
  matchPlayerPuuids: string[],
  scrimSessions: Array<{ sessionId: string; title: string; puuids: Set<string>; scheduledAt: Date | null }>
): { sessionId: string; title: string } | null {
  const matchSet = new Set(matchPlayerPuuids);
  for (const session of scrimSessions) {
    if (session.puuids.size === 0) continue;
    const allPresent = [...session.puuids].every((puuid) => matchSet.has(puuid));
    if (allPresent) {
      return { sessionId: session.sessionId, title: session.title };
    }
  }
  return null;
}

/** DB 캐시에서 매치 목록 조회. 만료됐거나 없으면 null 반환 */
async function getCachedMatches(puuid: string, region: string): Promise<{ matches: unknown[]; cachedAt: Date } | null> {
  try {
    const row = await prisma.$queryRaw<Array<{ matchesJson: string; cachedAt: Date }>>`
      SELECT "matchesJson", "cachedAt" FROM "MatchCache"
      WHERE puuid = ${puuid} AND region = ${region}
      LIMIT 1
    `;
    if (!row.length) return null;
    const cachedAt = new Date(row[0].cachedAt);
    if (Date.now() - cachedAt.getTime() > CACHE_TTL_MS) return null; // 만료
    const matches = JSON.parse(row[0].matchesJson) as unknown[];
    return { matches, cachedAt };
  } catch {
    return null;
  }
}

/** DB 캐시에 매치 목록 저장 (upsert) */
async function saveCachedMatches(puuid: string, region: string, matches: unknown[]): Promise<void> {
  const json = JSON.stringify(matches);
  try {
    await prisma.$executeRaw`
      INSERT INTO "MatchCache" (id, puuid, region, "matchesJson", "cachedAt")
      VALUES (gen_random_uuid()::text, ${puuid}, ${region}, ${json}, NOW())
      ON CONFLICT (puuid, region) DO UPDATE
        SET "matchesJson" = ${json}, "cachedAt" = NOW()
    `;
  } catch {
    // 테이블이 없으면 생성 후 재시도
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "MatchCache" (
        id TEXT PRIMARY KEY,
        puuid TEXT NOT NULL,
        region TEXT NOT NULL,
        "matchesJson" TEXT NOT NULL DEFAULT '[]',
        "cachedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (puuid, region)
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "MatchCache" (id, puuid, region, "matchesJson", "cachedAt")
      VALUES (gen_random_uuid()::text, ${puuid}, ${region}, ${json}, NOW())
      ON CONFLICT (puuid, region) DO UPDATE
        SET "matchesJson" = ${json}, "cachedAt" = NOW()
    `;
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  // force=true 이면 특정 region만 강제 갱신
  const forceRegion = url.searchParams.get("forceRegion"); // "KR" | "AP"

  const user = await findUser(session.user.id!, session.user.email);
  const accounts = user?.riotAccounts ?? [];

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

  await Promise.all(
    [...puuidRankMap.entries()].map(async ([puuid, entry]) => {
      const icon = await getRankIconByTier(entry.tierId).catch(() => null);
      puuidRankMap.set(puuid, { ...entry, tierIcon: icon });
    })
  );

  const scrimSessions = await getScrimSessionPuuidSets().catch(() => []);

  type AccountRow = { puuid: string; gameName: string; tagLine: string; region: string; accessToken: string | null; entitlementsToken: string | null; ssid: string | null; tokenExpiresAt: Date | null };
  const accountStats = await Promise.all(
    (accounts as AccountRow[]).map(async (account) => {
      const region = account.region as RiotRegion;
      const qRegion = toQueryRegion(region);
      const isForceRefresh = forceRegion === region;

      // ── 매치 목록: DB 캐시 우선, 강제 갱신 시 API 직접 호출 ──────────────────
      let rawMatches: Awaited<ReturnType<typeof getRecentMatches>> = [];
      let fromCache = false;
      let cacheAge: number | null = null;

      if (!isForceRefresh) {
        const cached = await getCachedMatches(account.puuid, region);
        if (cached) {
          rawMatches = cached.matches as typeof rawMatches;
          fromCache = true;
          cacheAge = Math.floor((Date.now() - cached.cachedAt.getTime()) / 1000);
        }
      }

      if (!fromCache) {
        const tokens = await ensureValidTokens(
          account.puuid,
          account.accessToken,
          account.entitlementsToken,
          account.ssid,
          account.tokenExpiresAt
        );

        rawMatches = await getRecentMatches(account.puuid, 10, qRegion, "pc", {
          puuidRankMap,
          skipAccountFallback: true,
          skipRankFallback: true,
        }).catch(() => []);

        // DB에 저장 (직렬화 가능한 형태로)
        if (rawMatches.length > 0) {
          const serializable = rawMatches.map((m) => ({
            ...m,
            playedAt: m.playedAt instanceof Date ? m.playedAt.toISOString() : m.playedAt,
          }));
          await saveCachedMatches(account.puuid, region, serializable).catch(() => {});
        }
      }

      // ── 랭크 정보 ──────────────────────────────────────────────────────────────
      const tokens = await ensureValidTokens(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.tokenExpiresAt
      ).catch(() => null);

      const rank = await fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens ?? null)
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
        .catch(() => null);

      // ── 커스텀 매치 필터링 ──────────────────────────────────────────────────────
      const processedMatches = rawMatches
        .map((m) => {
          const playedAt = m.playedAt instanceof Date ? m.playedAt.toISOString() : (m.playedAt as string);
          const isCustom =
            m.mode.toLowerCase().includes("custom") ||
            m.mode === "커스텀" ||
            m.mode === "Custom Game" ||
            m.mode === "모드 정보 없음";

          if (!isCustom) {
            return { ...m, playedAt, scrimSessionId: null, scrimTitle: null };
          }

          const matchPlayerPuuids = (m.scoreboard?.players ?? [])
            .map((p) => p.puuid)
            .filter(Boolean);

          if (matchPlayerPuuids.length === 0) return null;

          const matched = matchScrimSession(matchPlayerPuuids, scrimSessions);
          if (!matched) return null;

          return {
            ...m,
            playedAt,
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
        fromCache,
        cacheAge,
      };
    })
  );

  return Response.json({ accounts: accountStats });
}
