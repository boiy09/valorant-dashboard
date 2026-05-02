import axios from "axios";

const trackerClient = axios.create({
  baseURL: "https://api.tracker.gg/api/v2/valorant",
  headers: {
    "TRN-Api-Key": process.env.TRACKER_GG_API_KEY ?? "",
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
  },
  timeout: 10000,
});

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface TrackerStat {
  value: number | null;
  displayValue: string;
  percentile?: number;
  metadata?: Record<string, any>;
}

export interface TrackerOverview {
  // 순위/랭크
  rank: { displayValue: string; iconUrl: string | null } | null;
  peakRank: { displayValue: string; iconUrl: string | null } | null;
  // 경기
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;          // %
  timePlayed: string;       // "123h 45m"
  // KDA
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  kda: number;
  killsPerRound: number;
  // 기타
  damagePerRound: number;
  headshotPct: number;      // %
  scorePerRound: number;
  econRating: number;
  firstBloods: number;
  aces: number;
  clutches: number;
}

export interface TrackerAgentStat {
  key: string;
  name: string;
  imageUrl: string | null;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  kd: number;
  damagePerRound: number;
  headshotPct: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface TrackerSeasonStat {
  season: string;
  label: string;
  matchesPlayed: number;
  wins: number;
  winRate: number;
  kd: number;
  rank: { displayValue: string; iconUrl: string | null } | null;
}

export interface TrackerProfile {
  gameName: string;
  tagLine: string;
  avatarUrl: string | null;
  overview: TrackerOverview | null;
  agents: TrackerAgentStat[];
  seasons: TrackerSeasonStat[];
}

// ─── 파서 헬퍼 ───────────────────────────────────────────────────────────────

function statVal(stats: Record<string, any>, key: string): number {
  return stats?.[key]?.value ?? 0;
}
function statStr(stats: Record<string, any>, key: string): string {
  return stats?.[key]?.displayValue ?? "—";
}

function parseOverview(seg: any): TrackerOverview {
  const s = seg.stats ?? {};
  return {
    rank: s.rank
      ? { displayValue: s.rank.displayValue, iconUrl: s.rank.metadata?.iconUrl ?? null }
      : null,
    peakRank: s.peakRank
      ? { displayValue: s.peakRank.displayValue, iconUrl: s.peakRank.metadata?.iconUrl ?? null }
      : null,
    matchesPlayed: statVal(s, "matchesPlayed"),
    wins: statVal(s, "wins"),
    losses: statVal(s, "losses"),
    winRate: parseFloat((statVal(s, "wlRatio") > 0
      ? (statVal(s, "wins") / (statVal(s, "wins") + statVal(s, "losses")) * 100)
      : 0).toFixed(1)),
    timePlayed: statStr(s, "timePlayed"),
    kills: statVal(s, "kills"),
    deaths: statVal(s, "deaths"),
    assists: statVal(s, "assists"),
    kd: parseFloat((statVal(s, "kdRatio") || 0).toFixed(2)),
    kda: parseFloat((statVal(s, "kda") || 0).toFixed(2)),
    killsPerRound: parseFloat((statVal(s, "killsPerRound") || 0).toFixed(2)),
    damagePerRound: parseFloat((statVal(s, "damagePerRound") || 0).toFixed(1)),
    headshotPct: parseFloat((statVal(s, "headshotsPercentage") || 0).toFixed(1)),
    scorePerRound: parseFloat((statVal(s, "scorePerRound") || 0).toFixed(1)),
    econRating: parseFloat((statVal(s, "econRating") || 0).toFixed(1)),
    firstBloods: statVal(s, "firstBloods"),
    aces: statVal(s, "aces"),
    clutches: statVal(s, "clutches"),
  };
}

function parseAgent(seg: any): TrackerAgentStat {
  const s = seg.stats ?? {};
  const wins = statVal(s, "wins");
  const played = statVal(s, "matchesPlayed");
  return {
    key: seg.attributes?.key ?? "",
    name: seg.metadata?.name ?? seg.attributes?.key ?? "Unknown",
    imageUrl: seg.metadata?.imageUrl ?? null,
    matchesPlayed: played,
    wins,
    winRate: played > 0 ? parseFloat((wins / played * 100).toFixed(1)) : 0,
    kd: parseFloat((statVal(s, "kdRatio") || 0).toFixed(2)),
    damagePerRound: parseFloat((statVal(s, "damagePerRound") || 0).toFixed(1)),
    headshotPct: parseFloat((statVal(s, "headshotsPercentage") || 0).toFixed(1)),
    kills: statVal(s, "kills"),
    deaths: statVal(s, "deaths"),
    assists: statVal(s, "assists"),
  };
}

function parseSeason(seg: any): TrackerSeasonStat {
  const s = seg.stats ?? {};
  const wins = statVal(s, "wins");
  const played = statVal(s, "matchesPlayed");
  return {
    season: seg.attributes?.season ?? "",
    label: seg.metadata?.name ?? seg.attributes?.season ?? "시즌",
    matchesPlayed: played,
    wins,
    winRate: played > 0 ? parseFloat((wins / played * 100).toFixed(1)) : 0,
    kd: parseFloat((statVal(s, "kdRatio") || 0).toFixed(2)),
    rank: s.rank
      ? { displayValue: s.rank.displayValue, iconUrl: s.rank.metadata?.iconUrl ?? null }
      : null,
  };
}

// ─── 공개 함수 ────────────────────────────────────────────────────────────────

export async function getTrackerProfile(
  gameName: string,
  tagLine: string
): Promise<TrackerProfile> {
  if (!process.env.TRACKER_GG_API_KEY) {
    throw new Error("TRACKER_GG_API_KEY가 설정되지 않았습니다.");
  }

  const encoded = encodeURIComponent(`${gameName}#${tagLine}`);
  const res = await trackerClient.get(`/standard/profile/riot/${encoded}`);
  const data = res.data.data;

  const segments: any[] = data.segments ?? [];
  const overviewSeg = segments.find((s: any) => s.type === "overview");
  const agentSegs = segments.filter((s: any) => s.type === "agent");
  const seasonSegs = segments
    .filter((s: any) => s.type === "season" && s.attributes?.playlist === "competitive")
    .slice(0, 6);

  return {
    gameName: data.platformInfo?.platformUserHandle?.split("#")[0] ?? gameName,
    tagLine: data.platformInfo?.platformUserHandle?.split("#")[1] ?? tagLine,
    avatarUrl: data.platformInfo?.avatarUrl ?? null,
    overview: overviewSeg ? parseOverview(overviewSeg) : null,
    agents: agentSegs.map(parseAgent).sort((a, b) => b.matchesPlayed - a.matchesPlayed),
    seasons: seasonSegs.map(parseSeason),
  };
}
