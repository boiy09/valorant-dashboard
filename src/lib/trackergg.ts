import { formatValorantSeasonLabel } from "@/lib/seasonLabel";

/**
 * Tracker.gg Valorant API 클라이언트
 * Henrik API 대비 더 넉넉한 요청 한도와 사전 집계된 통계를 제공합니다.
 */

const BASE_URL = "https://public-api.tracker.gg/v2/valorant/standard";

function getHeaders() {
  return {
    "TRN-Api-Key": process.env.TRACKER_GG_API_KEY ?? "",
    Accept: "application/json",
    "Accept-Encoding": "gzip",
  };
}


function statVal(stat: unknown): number {
  if (stat && typeof stat === "object" && "value" in stat) {
    const v = (stat as { value: unknown }).value;
    return typeof v === "number" ? v : 0;
  }
  return 0;
}

function statMeta(stat: unknown, field: string): string {
  if (stat && typeof stat === "object" && "metadata" in stat) {
    const meta = (stat as { metadata: Record<string, unknown> }).metadata;
    const val = meta?.[field];
    return typeof val === "string" ? val : "";
  }
  return "";
}

export interface TggOverviewStats {
  matchesPlayed: number;
  wins: number;
  winRate: number;
  kd: number;
  headshotPct: number;
  killsPerRound: number;
  scorePerRound: number;
  damagePerRound: number;
  peakRankName: string;
  peakRankTier: number;
}

export interface TggSeason {
  season: string;
  label: string;
  rankName: string | null;
  tier: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
}

export interface TggAgent {
  name: string;
  imageUrl: string;
  matchesPlayed: number;
  winRate: number;
  kd: number;
  damagePerRound: number;
}

export interface TggProfile {
  gameName: string;
  tagLine: string;
  overview: TggOverviewStats;
  seasons: TggSeason[];
  agents: TggAgent[];
}

function parseSeasonLabel(season: string): string {
  return formatValorantSeasonLabel(season);
}

export async function getTrackerProfile(
  gameName: string,
  tagLine: string
): Promise<TggProfile> {
  const encoded = `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const url = `${BASE_URL}/profile/riot/${encoded}`;

  const res = await fetch(url, { headers: getHeaders(), cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`tracker.gg 오류: ${res.status}`), {
      status: res.status,
      body: text,
    });
  }

  const json = (await res.json()) as { data?: { segments?: unknown[] } };
  const segments: unknown[] = json?.data?.segments ?? [];

  // overview 세그먼트
  const overviewSeg = segments.find(
    (s): s is Record<string, unknown> =>
      typeof s === "object" && s !== null && (s as Record<string, unknown>).type === "overview"
  );
  const overviewStats = (overviewSeg as Record<string, unknown>)?.stats as Record<string, unknown> | undefined;

  const matchesPlayed = Math.round(statVal(overviewStats?.matchesPlayed));
  const wins = Math.round(statVal(overviewStats?.wins));

  const overview: TggOverviewStats = {
    matchesPlayed,
    wins,
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    kd: Math.round(statVal(overviewStats?.kRatio) * 100) / 100,
    headshotPct: Math.round(statVal(overviewStats?.headshotsPercentage) * 10) / 10,
    killsPerRound: Math.round(statVal(overviewStats?.killsPerRound) * 100) / 100,
    scorePerRound: Math.round(statVal(overviewStats?.scorePerRound)),
    damagePerRound: Math.round(statVal(overviewStats?.damagePerRound)),
    peakRankName: statMeta(overviewStats?.peakRank, "tierName"),
    peakRankTier: Math.round(statVal(overviewStats?.peakRank)),
  };

  // 시즌 세그먼트
  const seasons: TggSeason[] = segments
    .filter(
      (s): s is Record<string, unknown> =>
        typeof s === "object" && s !== null && (s as Record<string, unknown>).type === "season"
    )
    .map((s) => {
      const attrs = s.attributes as Record<string, unknown> | undefined;
      const stats = s.stats as Record<string, unknown> | undefined;
      const seasonKey = String(attrs?.season ?? "");
      const mp = Math.round(statVal(stats?.matchesPlayed));
      const w = Math.round(statVal(stats?.wins));
      return {
        season: seasonKey,
        label: parseSeasonLabel(seasonKey),
        rankName: statMeta(stats?.rank, "tierName") || null,
        tier: Math.round(statVal(stats?.rank)),
        matchesPlayed: mp,
        wins: w,
        winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
      };
    })
    .filter((s) => s.matchesPlayed > 0)
    .sort((a, b) => b.season.localeCompare(a.season));

  return {
    gameName,
    tagLine,
    overview,
    seasons,
    agents: [], // 에이전트는 별도 요청 필요 - 현재는 생략
  };
}

export interface TggCurrentRank {
  tierId: number;
  tierName: string;
  rankIcon: string | null;
}

export async function getTrackerCurrentRank(
  gameName: string,
  tagLine: string
): Promise<TggCurrentRank | null> {
  if (!process.env.TRACKER_GG_API_KEY) return null;
  try {
    const encoded = `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const url = `${BASE_URL}/profile/riot/${encoded}`;
    const res = await fetch(url, { headers: getHeaders(), cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: { segments?: unknown[] } };
    const segments: unknown[] = json?.data?.segments ?? [];
    const overview = segments.find(
      (s): s is Record<string, unknown> =>
        typeof s === "object" && s !== null && (s as Record<string, unknown>).type === "overview"
    );
    if (!overview) return null;

    const stats = (overview as Record<string, unknown>).stats as Record<string, unknown> | undefined;
    const rankStat = stats?.rank;
    const tierId = Math.round(statVal(rankStat));
    if (tierId <= 0) return null;

    const tierName = statMeta(rankStat, "tierName") || null;
    const rankIcon = statMeta(rankStat, "iconUrl") || null;

    return { tierId, tierName: tierName ?? "언랭크", rankIcon: rankIcon || null };
  } catch {
    return null;
  }
}

export async function getTrackerAgents(
  gameName: string,
  tagLine: string
): Promise<TggAgent[]> {
  const encoded = `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const url = `${BASE_URL}/profile/riot/${encoded}/segments/agent`;

  const res = await fetch(url, { headers: getHeaders(), cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as { data?: unknown[] };
  const segments: unknown[] = json?.data ?? [];

  return segments
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => {
      const stats = s.stats as Record<string, unknown> | undefined;
      const meta = s.metadata as Record<string, unknown> | undefined;
      const mp = Math.round(statVal(stats?.matchesPlayed));
      const w = Math.round(statVal(stats?.wins));
      return {
        name: String(meta?.name ?? "Unknown"),
        imageUrl: String(meta?.imageUrl ?? ""),
        matchesPlayed: mp,
        winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
        kd: Math.round(statVal(stats?.kRatio) * 100) / 100,
        damagePerRound: Math.round(statVal(stats?.damagePerRound)),
      };
    })
    .filter((a) => a.matchesPlayed > 0)
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
}
