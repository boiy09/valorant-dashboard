import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import axios from "axios";
import { getTrackerProfile, getTrackerAgents } from "@/lib/trackergg";
import { apiCache, TTL } from "@/lib/apiCache";
import { formatValorantSeasonLabel } from "@/lib/seasonLabel";

// ──────────────────────────────────────────────
// Henrik 클라이언트 (폴백용)
// ──────────────────────────────────────────────
const henrikClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
  timeout: 15000,
});

type SupportedRegion = "KR" | "AP";

interface TrackerSummaryResponse {
  gameName: string;
  tagLine: string;
  region: SupportedRegion;
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
  rateLimit?: { limit: number; remaining: number; resetInSecs: number };
  source: "trackergg" | "henrik";
  cached?: boolean;
  cacheAgeSec?: number;
}

function normalizeRegion(region: string | null): SupportedRegion {
  return region?.toUpperCase() === "AP" ? "AP" : "KR";
}

function buildCacheKey(gameName: string, tagLine: string, region: SupportedRegion) {
  return `tracker:${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}@${region}`;
}

// ──────────────────────────────────────────────
// tracker.gg 기반 데이터 조회
// ──────────────────────────────────────────────
async function fetchFromTrackerGg(
  gameName: string,
  tagLine: string,
  preferredRegion: SupportedRegion
): Promise<TrackerSummaryResponse> {
  const [profile, agents] = await Promise.all([
    getTrackerProfile(gameName, tagLine),
    getTrackerAgents(gameName, tagLine),
  ]);

  return {
    gameName,
    tagLine,
    region: preferredRegion,
    stats: {
      matchesPlayed: profile.overview.matchesPlayed,
      winRate: profile.overview.winRate,
      kd: profile.overview.kd,
      headshotPct: profile.overview.headshotPct,
      killsPerRound: profile.overview.killsPerRound,
      scorePerRound: profile.overview.scorePerRound,
      damagePerRound: profile.overview.damagePerRound,
    },
    agents: agents.length > 0 ? agents : profile.agents,
    seasons: profile.seasons,
    source: "trackergg",
  };
}

// ──────────────────────────────────────────────
// Henrik 기반 데이터 조회 (폴백)
// ──────────────────────────────────────────────
function resolveRegions(preferred: SupportedRegion) {
  const first = preferred.toLowerCase() as Lowercase<SupportedRegion>;
  const second = first === "kr" ? "ap" : "kr";
  return [first, second] as const;
}

async function fetchFromHenrik(
  gameName: string,
  tagLine: string,
  preferredRegion: SupportedRegion
): Promise<TrackerSummaryResponse> {
  const profileRes = await henrikClient.get(
    `/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
  const puuid = profileRes.data.data.puuid as string;

  let matchesRes: any = null;
  let matchedRegion: Lowercase<SupportedRegion> = "kr";

  for (const region of resolveRegions(preferredRegion)) {
    const res = await henrikClient
      .get(`/v4/by-puuid/matches/${region}/pc/${puuid}?size=20`)
      .catch(() => null);
    if (res?.data?.data?.length) {
      matchesRes = res;
      matchedRegion = region;
      break;
    }
    if (!matchesRes && res) { matchesRes = res; matchedRegion = region; }
  }

  if (!matchesRes) throw new Error("최근 경기 데이터를 불러오지 못했습니다.");

  const mmrRes = await henrikClient
    .get(`/v2/by-puuid/mmr/${matchedRegion}/${puuid}`)
    .catch(() => null);

  const matches: any[] = matchesRes.data.data ?? [];
  let kills = 0, deaths = 0, hs = 0, bs = 0, ls = 0, score = 0, damage = 0, rounds = 0, wins = 0;
  const agentMap: Record<string, any> = {};

  for (const match of matches) {
    const player = match.players?.all_players?.find((p: any) => p.puuid === puuid);
    if (!player) continue;
    const teamKey = player.team?.toLowerCase();
    const team = match.teams?.[teamKey];
    const r = (team?.rounds_won ?? 0) + (team?.rounds_lost ?? 0);
    const won = team?.has_won ?? false;
    kills += player.stats?.kills ?? 0;
    deaths += player.stats?.deaths ?? 0;
    hs += player.stats?.headshots ?? 0;
    bs += player.stats?.bodyshots ?? 0;
    ls += player.stats?.legshots ?? 0;
    score += player.stats?.score ?? 0;
    damage += player.damage_made ?? 0;
    rounds += r;
    if (won) wins++;

    const name = player.character ?? "Unknown";
    if (!agentMap[name]) agentMap[name] = { name, imageUrl: player.assets?.agent?.small ?? "", kills: 0, deaths: 0, damage: 0, rounds: 0, wins: 0, matches: 0 };
    const ag = agentMap[name];
    ag.kills += player.stats?.kills ?? 0;
    ag.deaths += player.stats?.deaths ?? 0;
    ag.damage += player.damage_made ?? 0;
    ag.rounds += r;
    ag.matches++;
    if (won) ag.wins++;
  }

  const mc = matches.length;
  const totalShots = hs + bs + ls;

  const seasons: TrackerSummaryResponse["seasons"] = [];
  const bySeason = mmrRes?.data?.data?.by_season;
  if (bySeason) {
    for (const [key, val] of Object.entries(bySeason) as [string, any][]) {
      if (!val || (val.number_of_games ?? 0) === 0) continue;
      seasons.push({
        season: key,
        label: formatValorantSeasonLabel(key),
        rankName: val.final_rank_patched ?? null,
        tier: val.final_rank ?? 0,
        matchesPlayed: val.number_of_games ?? 0,
        wins: val.wins ?? 0,
        winRate: val.number_of_games > 0 ? Math.round(((val.wins ?? 0) / val.number_of_games) * 100) : 0,
      });
    }
    seasons.sort((a, b) => b.season.localeCompare(a.season));
  }

  const headers = matchesRes.headers;
  const rawReset = Number(headers["x-ratelimit-reset"] ?? headers["ratelimit-reset"] ?? 0);

  return {
    gameName,
    tagLine,
    region: matchedRegion.toUpperCase() as SupportedRegion,
    stats: {
      matchesPlayed: mc,
      winRate: mc > 0 ? Math.round((wins / mc) * 100) : 0,
      kd: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills,
      headshotPct: totalShots > 0 ? Math.round((hs / totalShots) * 100) : 0,
      killsPerRound: rounds > 0 ? Math.round((kills / rounds) * 100) / 100 : 0,
      scorePerRound: rounds > 0 ? Math.round(score / rounds) : 0,
      damagePerRound: rounds > 0 ? Math.round(damage / rounds) : 0,
    },
    agents: Object.values(agentMap)
      .sort((a, b) => b.matches - a.matches)
      .map((ag) => ({
        name: ag.name, imageUrl: ag.imageUrl,
        matchesPlayed: ag.matches,
        winRate: Math.round((ag.wins / ag.matches) * 100),
        kd: ag.deaths > 0 ? Math.round((ag.kills / ag.deaths) * 100) / 100 : ag.kills,
        damagePerRound: ag.rounds > 0 ? Math.round(ag.damage / ag.rounds) : 0,
      })),
    seasons,
    rateLimit: {
      limit: Number(headers["x-ratelimit-limit"] ?? headers["ratelimit-limit"] ?? 0),
      remaining: Number(headers["x-ratelimit-remaining"] ?? headers["ratelimit-remaining"] ?? 0),
      resetInSecs: rawReset > 1_000_000_000
        ? Math.max(0, Math.ceil((rawReset * 1000 - Date.now()) / 1000))
        : rawReset,
    },
    source: "henrik",
  };
}

// ──────────────────────────────────────────────
// 통합 조회 (tracker.gg 우선 → Henrik 폴백)
// ──────────────────────────────────────────────
async function fetchTrackerSummary(
  gameName: string,
  tagLine: string,
  preferredRegion: SupportedRegion
): Promise<TrackerSummaryResponse> {
  if (process.env.TRACKER_GG_API_KEY) {
    try {
      return await fetchFromTrackerGg(gameName, tagLine, preferredRegion);
    } catch (err: any) {
      // 404는 폴백 불필요
      if (err?.status === 404) throw err;
      console.warn("[tracker] tracker.gg 실패, Henrik으로 폴백:", err?.message);
    }
  }

  if (!process.env.HENRIK_API_KEY) {
    throw new Error("API 키가 설정되지 않았습니다.");
  }

  return fetchFromHenrik(gameName, tagLine, preferredRegion);
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

// ──────────────────────────────────────────────
// GET /api/tracker
// ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const gameName = req.nextUrl.searchParams.get("gameName");
  const tagLine = req.nextUrl.searchParams.get("tagLine");
  const region = normalizeRegion(req.nextUrl.searchParams.get("region"));

  if (!gameName || !tagLine) {
    return Response.json({ error: "gameName과 tagLine이 필요합니다." }, { status: 400 });
  }

  if (!process.env.TRACKER_GG_API_KEY && !process.env.HENRIK_API_KEY) {
    return Response.json({ error: "API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  const cacheKey = buildCacheKey(gameName, tagLine, region);

  try {
    const { data, cached, ageMs } = await apiCache.getOrFetch(
      cacheKey,
      TTL.MEDIUM,
      () => fetchTrackerSummary(gameName, tagLine, region)
    );

    return jsonResponse(
      cached ? { ...data, cached: true, cacheAgeSec: Math.floor(ageMs / 1000) } : data,
      {
        headers: {
          "X-Tracker-Cache": cached ? "HIT" : "MISS",
          "X-Tracker-Source": data.source,
          ...(cached ? { "X-Tracker-Cache-Age": String(Math.floor(ageMs / 1000)) } : {}),
        },
      }
    );
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status;
    console.error("[tracker] 오류:", error?.message);
    if (status === 404) return Response.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
    if (status === 429) return Response.json({ error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    if (status === 401 || status === 403) return Response.json({ error: "API 권한이 유효하지 않습니다." }, { status: 503 });
    return Response.json({ error: "통계 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
