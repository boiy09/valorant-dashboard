/**
 * Tracker.gg Valorant API 클라이언트
 * Henrik API 대비 더 넉넉한 요청 한도와 사전 집계된 통계를 제공합니다.
 */

const BASE_URL = "https://public-api.tracker.gg/v2/valorant/standard";
const INTERNAL_BASE = "https://api.tracker.gg/api/v2/valorant/standard";

function getHeaders() {
  return {
    "TRN-Api-Key": process.env.TRACKER_GG_API_KEY ?? "",
    Accept: "application/json",
    "Accept-Encoding": "gzip",
  };
}

// 브라우저처럼 보이는 헤더 — Cloudflare API 서브도메인은 저용량에서 통과되는 경우가 많음
function getBrowserHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://tracker.gg/valorant/profile/riot/",
    "Origin": "https://tracker.gg",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
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
  const m = season.match(/e(\d+)a(\d+)/i);
  if (m) return `에피소드 ${m[1]} 액트 ${m[2]}`;
  return season;
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

// ─────────────────────────────────────────
// 내부 API — 매치 히스토리 (비공식)
// ─────────────────────────────────────────

export interface TggMatchPlayer {
  puuid: string;
  name: string;
  tag: string;
  teamId: string;
  agent: string;
  agentIcon: string;
  cardIcon: string;
  tierName: string;
  tierId: number;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  plusMinus: number;
  kd: number;
  hsPercent: number;
  adr: number | null;
}

export interface TggMatch {
  matchId: string;
  map: string;
  mode: string;
  startedAt: string;
  gameLengthMs: number;
  result: "승리" | "패배" | "무효";
  kills: number;
  deaths: number;
  assists: number;
  agent: string;
  agentIcon: string;
  teamScore: number | null;
  enemyScore: number | null;
  players: TggMatchPlayer[];
}

function tggStatVal(stat: unknown): number {
  if (!stat || typeof stat !== "object") return 0;
  const s = stat as Record<string, unknown>;
  const v = s.value ?? s.displayValue;
  return typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
}

function tggStr(stat: unknown, field = "displayValue"): string {
  if (!stat || typeof stat !== "object") return "";
  const s = stat as Record<string, unknown>;
  const meta = s.metadata as Record<string, unknown> | undefined;
  return String(meta?.[field] ?? s[field] ?? s.displayValue ?? "") || "";
}

export async function getTrackerMatchHistory(
  gameName: string,
  tagLine: string,
  count = 20
): Promise<TggMatch[] | null> {
  const encoded = `${encodeURIComponent(gameName)}%23${encodeURIComponent(tagLine)}`;
  const url = `${INTERNAL_BASE}/matches/riot/${encoded}?type=competitive&season=all&count=${count}`;

  try {
    const res = await fetch(url, {
      headers: getBrowserHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const json = await res.json() as { data?: unknown };
    const matches = Array.isArray(json?.data) ? json.data as unknown[] : null;
    if (!matches) return null;

    return matches.map((m: unknown) => {
      const match = m as Record<string, unknown>;
      const attrs = match.attributes as Record<string, unknown> | undefined;
      const metadata = match.metadata as Record<string, unknown> | undefined;
      const segments = Array.isArray(match.segments) ? match.segments as unknown[] : [];

      // 내 세그먼트
      const meSeg = segments.find((s: unknown) => {
        const seg = s as Record<string, unknown>;
        return seg.type === "player" && (seg.attributes as Record<string, unknown>)?.playerId === `${gameName}#${tagLine}`;
      }) as Record<string, unknown> | undefined;

      const myStats = meSeg?.stats as Record<string, unknown> | undefined;
      const myMeta = meSeg?.metadata as Record<string, unknown> | undefined;
      const myAttrs = meSeg?.attributes as Record<string, unknown> | undefined;

      const kills = Math.round(tggStatVal(myStats?.kills));
      const deaths = Math.round(tggStatVal(myStats?.deaths));
      const assists = Math.round(tggStatVal(myStats?.assists));
      const outcome = String(myMeta?.result ?? "").toLowerCase();
      const result: "승리" | "패배" | "무효" =
        outcome === "victory" || outcome === "win" ? "승리"
        : outcome === "defeat" || outcome === "loss" ? "패배"
        : "무효";

      // 전체 플레이어 세그먼트
      const playerSegs = segments.filter((s: unknown) => (s as Record<string, unknown>).type === "player");
      const players: TggMatchPlayer[] = playerSegs.map((s: unknown) => {
        const seg = s as Record<string, unknown>;
        const st = seg.stats as Record<string, unknown> | undefined;
        const mt = seg.metadata as Record<string, unknown> | undefined;
        const at = seg.attributes as Record<string, unknown> | undefined;
        const playerId = String(at?.playerId ?? "");
        const [pName, pTag] = playerId.includes("#") ? playerId.split("#") : [playerId, ""];
        const k = Math.round(tggStatVal(st?.kills));
        const d = Math.round(tggStatVal(st?.deaths));
        const a = Math.round(tggStatVal(st?.assists));
        const hs = Math.round(tggStatVal(st?.headshotsPercentage));
        return {
          puuid: String(at?.puuid ?? playerId),
          name: pName,
          tag: pTag,
          teamId: String(mt?.teamId ?? at?.teamId ?? ""),
          agent: tggStr(st?.characterName ?? mt?.characterName) || String(mt?.agentName ?? ""),
          agentIcon: String(mt?.agentImageUrl ?? mt?.characterImageUrl ?? ""),
          cardIcon: String(mt?.cardImageUrl ?? mt?.avatarUrl ?? ""),
          tierName: tggStr(st?.rank) || String(mt?.rankName ?? "Unranked"),
          tierId: Math.round(tggStatVal(st?.rank)),
          acs: Math.round(tggStatVal(st?.score) / Math.max(1, Math.round(tggStatVal(st?.roundsPlayed)))),
          kills: k,
          deaths: d,
          assists: a,
          plusMinus: k - d,
          kd: d > 0 ? Math.round((k / d) * 100) / 100 : k,
          hsPercent: hs,
          adr: st?.damagePerRound ? Math.round(tggStatVal(st.damagePerRound)) : null,
        };
      });

      const myTeamId = players.find(p => p.name === gameName && p.tag === tagLine)?.teamId ?? "";
      const myTeamPlayers = players.filter(p => p.teamId === myTeamId);
      const enemyPlayers = players.filter(p => p.teamId !== myTeamId);
      const teamScore = myTeamPlayers.length > 0 ? Math.round(tggStatVal(myStats?.roundsWon ?? (meSeg as Record<string, unknown>|undefined)?.roundsWon)) : null;
      const enemyScore = enemyPlayers.length > 0 ? Math.round(tggStatVal((meSeg as Record<string, unknown>|undefined)?.roundsLost ?? myStats?.roundsLost)) : null;

      return {
        matchId: String(attrs?.id ?? attrs?.matchId ?? ""),
        map: String(metadata?.mapName ?? metadata?.map ?? "Unknown"),
        mode: String(metadata?.modeName ?? metadata?.mode ?? "Unknown"),
        startedAt: String(metadata?.timestamp ?? ""),
        gameLengthMs: Math.round(tggStatVal(metadata?.duration)) * 1000,
        result,
        kills,
        deaths,
        assists,
        agent: tggStr(myMeta?.agentName ?? myAttrs?.characterName) || String(myMeta?.characterName ?? ""),
        agentIcon: String(myMeta?.agentImageUrl ?? myMeta?.characterImageUrl ?? ""),
        teamScore: teamScore && teamScore >= 0 ? teamScore : null,
        enemyScore: enemyScore && enemyScore >= 0 ? enemyScore : null,
        players,
      };
    });
  } catch {
    return null;
  }
}
