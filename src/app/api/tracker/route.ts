import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import axios from "axios";

const henrikClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
});

const CACHE_TTL_MS = 1000 * 60 * 10;

interface TrackerSummaryResponse {
  gameName: string;
  tagLine: string;
  stats: {
    matchesPlayed: number;
    winRate: number;
    kd: number;
    headshotPct: number;
    killsPerRound: number;
    scorePerRound: number;
    damagePerRound: number;
  };
  agents: Array<{
    name: string;
    imageUrl: string;
    matchesPlayed: number;
    winRate: number;
    kd: number;
    damagePerRound: number;
  }>;
  seasons: Array<{
    season: string;
    label: string;
    rankName: string | null;
    tier: number;
    matchesPlayed: number;
    wins: number;
    winRate: number;
  }>;
  rateLimit?: {
    limit: number;
    remaining: number;
    resetInSecs: number;
  };
  source: "henrik";
  cached?: boolean;
  cacheAgeSec?: number;
}

const responseCache = new Map<string, { data: TrackerSummaryResponse; cachedAt: number }>();
const inflightRequests = new Map<string, Promise<TrackerSummaryResponse>>();

function buildCacheKey(gameName: string, tagLine: string) {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
}

function getCachedResponse(cacheKey: string) {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;

  const ageMs = Date.now() - cached.cachedAt;
  if (ageMs > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }

  return {
    data: {
      ...cached.data,
      cached: true,
      cacheAgeSec: Math.floor(ageMs / 1000),
    },
    ageMs,
  };
}

async function fetchTrackerSummary(gameName: string, tagLine: string): Promise<TrackerSummaryResponse> {
  const profileResponse = await henrikClient.get(
    `/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
  const puuid = profileResponse.data.data.puuid;

  let matchesResponse = await henrikClient.get(`/v3/by-puuid/matches/kr/${puuid}?size=20`);
  let region = "kr";

  if (!matchesResponse.data.data?.length) {
    const apResponse = await henrikClient
      .get(`/v3/by-puuid/matches/ap/${puuid}?size=20`)
      .catch(() => null);
    if (apResponse?.data?.data?.length) {
      matchesResponse = apResponse;
      region = "ap";
    }
  }

  const mmrResponse = await henrikClient.get(`/v2/by-puuid/mmr/${region}/${puuid}`).catch(() => null);
  const matches: any[] = matchesResponse.data.data ?? [];

  let totalKills = 0;
  let totalDeaths = 0;
  let totalHeadshots = 0;
  let totalBodyshots = 0;
  let totalLegshots = 0;
  let totalScore = 0;
  let totalDamage = 0;
  let totalRounds = 0;
  let wins = 0;

  const agentMap: Record<
    string,
    {
      name: string;
      imageUrl: string;
      kills: number;
      deaths: number;
      damage: number;
      rounds: number;
      wins: number;
      matches: number;
    }
  > = {};

  for (const match of matches) {
    const player = match.players?.all_players?.find((candidate: any) => candidate.puuid === puuid);
    if (!player) continue;

    const teamKey = player.team?.toLowerCase();
    const teamData = match.teams?.[teamKey];
    const rounds = (teamData?.rounds_won ?? 0) + (teamData?.rounds_lost ?? 0);
    const won = teamData?.has_won ?? false;

    totalKills += player.stats?.kills ?? 0;
    totalDeaths += player.stats?.deaths ?? 0;
    totalHeadshots += player.stats?.headshots ?? 0;
    totalBodyshots += player.stats?.bodyshots ?? 0;
    totalLegshots += player.stats?.legshots ?? 0;
    totalScore += player.stats?.score ?? 0;
    totalDamage += player.damage_made ?? 0;
    totalRounds += rounds;
    if (won) wins++;

    const agentName = player.character ?? "Unknown";
    if (!agentMap[agentName]) {
      agentMap[agentName] = {
        name: agentName,
        imageUrl: player.assets?.agent?.small ?? "",
        kills: 0,
        deaths: 0,
        damage: 0,
        rounds: 0,
        wins: 0,
        matches: 0,
      };
    }

    const agent = agentMap[agentName];
    agent.kills += player.stats?.kills ?? 0;
    agent.deaths += player.stats?.deaths ?? 0;
    agent.damage += player.damage_made ?? 0;
    agent.rounds += rounds;
    agent.matches++;
    if (won) agent.wins++;
  }

  const matchCount = matches.length;
  const totalShots = totalHeadshots + totalBodyshots + totalLegshots;

  const stats = {
    matchesPlayed: matchCount,
    winRate: matchCount > 0 ? Math.round((wins / matchCount) * 100) : 0,
    kd: totalDeaths > 0 ? Math.round((totalKills / totalDeaths) * 100) / 100 : totalKills,
    headshotPct: totalShots > 0 ? Math.round((totalHeadshots / totalShots) * 100) : 0,
    killsPerRound: totalRounds > 0 ? Math.round((totalKills / totalRounds) * 100) / 100 : 0,
    scorePerRound: totalRounds > 0 ? Math.round(totalScore / totalRounds) : 0,
    damagePerRound: totalRounds > 0 ? Math.round(totalDamage / totalRounds) : 0,
  };

  const agents = Object.values(agentMap)
    .sort((left, right) => right.matches - left.matches)
    .map((agent) => ({
      name: agent.name,
      imageUrl: agent.imageUrl,
      matchesPlayed: agent.matches,
      winRate: Math.round((agent.wins / agent.matches) * 100),
      kd: agent.deaths > 0 ? Math.round((agent.kills / agent.deaths) * 100) / 100 : agent.kills,
      damagePerRound: agent.rounds > 0 ? Math.round(agent.damage / agent.rounds) : 0,
    }));

  const seasons: TrackerSummaryResponse["seasons"] = [];
  const bySeason = mmrResponse?.data?.data?.by_season;
  if (bySeason) {
    for (const [seasonKey, value] of Object.entries(bySeason) as [string, any][]) {
      if (!value || (value.number_of_games ?? 0) === 0) continue;
      const match = seasonKey.match(/e(\d+)a(\d+)/);
      seasons.push({
        season: seasonKey,
        label: match ? `에피소드 ${match[1]} 액트 ${match[2]}` : seasonKey,
        rankName: value.final_rank_patched ?? null,
        tier: value.final_rank ?? 0,
        matchesPlayed: value.number_of_games ?? 0,
        wins: value.wins ?? 0,
        winRate:
          value.number_of_games > 0
            ? Math.round(((value.wins ?? 0) / value.number_of_games) * 100)
            : 0,
      });
    }
    seasons.sort((left, right) => right.season.localeCompare(left.season));
  }

  const rateLimitHeaders = matchesResponse.headers;
  const rawReset = Number(
    rateLimitHeaders["x-ratelimit-reset"] ?? rateLimitHeaders["ratelimit-reset"] ?? 0
  );
  const resetInSecs =
    rawReset > 1_000_000_000
      ? Math.max(0, Math.ceil((rawReset * 1000 - Date.now()) / 1000))
      : rawReset;

  return {
    gameName,
    tagLine,
    stats,
    agents,
    seasons,
    rateLimit: {
      limit: Number(
        rateLimitHeaders["x-ratelimit-limit"] ?? rateLimitHeaders["ratelimit-limit"] ?? 0
      ),
      remaining: Number(
        rateLimitHeaders["x-ratelimit-remaining"] ??
          rateLimitHeaders["ratelimit-remaining"] ??
          0
      ),
      resetInSecs,
    },
    source: "henrik",
  };
}

function jsonResponse(body: TrackerSummaryResponse | { error: string }, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const gameName = req.nextUrl.searchParams.get("gameName");
  const tagLine = req.nextUrl.searchParams.get("tagLine");
  if (!gameName || !tagLine) {
    return Response.json({ error: "gameName과 tagLine이 필요합니다." }, { status: 400 });
  }

  if (!process.env.HENRIK_API_KEY) {
    return Response.json({ error: "Henrik API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  const cacheKey = buildCacheKey(gameName, tagLine);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return jsonResponse(cached.data, {
      headers: {
        "X-Tracker-Cache": "HIT",
        "X-Tracker-Cache-Age": String(Math.floor(cached.ageMs / 1000)),
      },
    });
  }

  const existingRequest = inflightRequests.get(cacheKey);
  if (existingRequest) {
    try {
      const sharedData = await existingRequest;
      return jsonResponse({ ...sharedData, cached: true }, { headers: { "X-Tracker-Cache": "SHARED" } });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) return Response.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
      if (status === 429) return Response.json({ error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
      if (status === 401 || status === 403) {
        return Response.json({ error: "Henrik API 권한이 유효하지 않습니다." }, { status: 503 });
      }
      return Response.json({ error: "데이터를 가져오지 못했습니다." }, { status: 500 });
    }
  }

  const requestPromise = fetchTrackerSummary(gameName, tagLine);
  inflightRequests.set(cacheKey, requestPromise);

  try {
    const data = await requestPromise;
    responseCache.set(cacheKey, { data, cachedAt: Date.now() });
    return jsonResponse(data, { headers: { "X-Tracker-Cache": "MISS" } });
  } catch (error: any) {
    const status = error?.response?.status;
    console.error("Tracker summary error:", error?.message);
    if (status === 404) return Response.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
    if (status === 429) {
      return Response.json(
        { error: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }
    if (status === 401 || status === 403) {
      return Response.json({ error: "Henrik API 권한이 유효하지 않습니다." }, { status: 503 });
    }
    return Response.json({ error: "데이터를 가져오지 못했습니다." }, { status: 500 });
  } finally {
    inflightRequests.delete(cacheKey);
  }
}
