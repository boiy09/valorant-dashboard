import axios from "axios";

const henrikClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
  timeout: 15000,
});

export type ValorantRegion = "kr" | "ap" | "na" | "eu" | "latam" | "br";
export type ValorantPlatform = "pc" | "console";
export type MatchResult = "승리" | "패배" | "무효";

export interface PlayerProfile {
  puuid: string;
  gameName: string;
  tagLine: string;
  accountLevel: number;
  card?: string;
}

export interface RankData {
  tier: string;
  tierName: string;
  rr: number;
  peakTier: string;
  peakTierName: string;
  wins: number;
  games: number;
  rankIcon?: string | null;
  peakRankIcon?: string | null;
}

export interface MatchStats {
  matchId: string;
  map: string;
  mode: string;
  agent: string;
  agentIcon: string;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
  playedAt: Date;
}

export interface MmrHistoryEntry {
  matchId: string;
  map: string;
  tierName: string;
  rr: number;
  rrChange: number;
  elo: number;
  playedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  gameName: string;
  tagLine: string;
  rr: number;
  wins: number;
  tier: number;
  isAnonymized: boolean;
}

export interface ValorantAgent {
  id: string;
  name: string;
  assetName: string;
}

export interface ValorantMap {
  id: string;
  name: string;
  assetName: string;
}

export interface ValorantContentBundle {
  version: string;
  agents: ValorantAgent[];
  maps: ValorantMap[];
  acts: Array<{
    id: string;
    parentId: string;
    type: string;
    name: string;
    isActive: boolean;
  }>;
}

export interface ValorantStatusSummary {
  maintenances: Array<{
    title: string;
    updatedAt?: string;
  }>;
  incidents: Array<{
    title: string;
    updatedAt?: string;
  }>;
}

export interface QueueStatusSummary {
  mode: string;
  modeId: string;
  enabled: boolean;
  ranked: boolean;
  maps: string[];
}

export interface EsportsMatchSummary {
  leagueName: string;
  leagueCode: string;
  tournamentName: string;
  state: string;
  startsAt: Date;
  teamOne: string;
  teamTwo: string;
  score: string;
  vodUrl?: string | null;
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toString(value: unknown, fallback = "정보 없음") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function parseRiotId(input: string) {
  const [gameName, tagLine] = input.split("#");
  if (!gameName || !tagLine) return null;
  return { gameName: gameName.trim(), tagLine: tagLine.trim() };
}

function getMatchResult(match: any, puuid: string): MatchResult {
  const players = asArray<any>(match.players);
  const me = players.find((player) => player?.puuid === puuid);
  if (!me) return "무효";

  const teams = asArray<any>(match.teams);
  const myTeam = teams.find((team) => team?.team_id === me.team_id);
  const otherTeam = teams.find((team) => team?.team_id !== me.team_id);

  if (myTeam?.won === true || myTeam?.has_won === true) return "승리";
  if (otherTeam?.won === true || otherTeam?.has_won === true) return "패배";
  return "무효";
}

export async function getPlayerByRiotId(
  gameName: string,
  tagLine: string
): Promise<PlayerProfile> {
  const response = await henrikClient.get(
    `/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
  const data = response.data?.data;

  return {
    puuid: toString(data?.puuid, ""),
    gameName: toString(data?.name, gameName),
    tagLine: toString(data?.tag, tagLine),
    accountLevel: toNumber(data?.account_level),
    card: data?.card?.small ?? undefined,
  };
}

export async function getRankByPuuid(
  puuid: string,
  region: ValorantRegion = "kr"
): Promise<RankData | null> {
  try {
    const response = await henrikClient.get(`/v2/by-puuid/mmr/${region}/${puuid}`);
    const data = response.data?.data;
    const current = data?.current_data ?? {};
    const peak = data?.highest_rank ?? {};

    return {
      tier: toString(current?.currenttier_patched, "언랭크"),
      tierName: toString(current?.currenttier_patched, "언랭크"),
      rr: toNumber(current?.ranking_in_tier),
      peakTier: toString(peak?.patched_tier, "기록 없음"),
      peakTierName: toString(peak?.patched_tier, "기록 없음"),
      wins: toNumber(data?.wins),
      games: toNumber(data?.wins) + toNumber(data?.losses),
      rankIcon: current?.images?.small ?? null,
      peakRankIcon: peak?.images?.small ?? null,
    };
  } catch {
    return null;
  }
}

export async function getRecentMatches(
  puuid: string,
  count = 5,
  region: ValorantRegion = "kr",
  platform: ValorantPlatform = "pc"
): Promise<MatchStats[]> {
  const response = await henrikClient.get(
    `/v4/by-puuid/matches/${region}/${platform}/${puuid}?size=${count}`
  );
  const matches = asArray<any>(response.data?.data);

  return matches.map((match) => {
    const players = asArray<any>(match.players);
    const me = players.find((player) => player?.puuid === puuid) ?? {};
    const stats = me?.stats ?? {};

    return {
      matchId: toString(match?.metadata?.match_id, ""),
      map: toString(match?.metadata?.map?.name, "맵 정보 없음"),
      mode: toString(match?.metadata?.queue?.name, "모드 정보 없음"),
      agent: toString(me?.agent?.name, "요원 정보 없음"),
      agentIcon: me?.assets?.agent?.small ?? "",
      result: getMatchResult(match, puuid),
      kills: toNumber(stats?.kills),
      deaths: toNumber(stats?.deaths),
      assists: toNumber(stats?.assists),
      score: toNumber(stats?.score),
      headshots: toNumber(stats?.headshots),
      bodyshots: toNumber(stats?.bodyshots),
      legshots: toNumber(stats?.legshots),
      playedAt: new Date(match?.metadata?.started_at ?? Date.now()),
    };
  });
}

export async function getPlayerStats(
  gameName: string,
  tagLine: string,
  region: ValorantRegion = "kr"
) {
  const profile = await getPlayerByRiotId(gameName, tagLine);
  const [rank, recentMatches] = await Promise.all([
    getRankByPuuid(profile.puuid, region),
    getRecentMatches(profile.puuid, 5, region),
  ]);

  return { profile, rank, recentMatches };
}

export async function getMmrHistoryByPuuid(
  puuid: string,
  count = 5,
  region: ValorantRegion = "kr"
): Promise<MmrHistoryEntry[]> {
  const response = await henrikClient.get(`/v1/by-puuid/mmr-history/${region}/${puuid}`);
  const history = asArray<any>(response.data?.data).slice(0, count);

  return history.map((entry) => ({
    matchId: toString(entry?.match_id, ""),
    map: toString(entry?.map?.name, "맵 정보 없음"),
    tierName: toString(entry?.currenttierpatched, "언랭크"),
    rr: toNumber(entry?.ranking_in_tier),
    rrChange: toNumber(entry?.mmr_change_to_last_game),
    elo: toNumber(entry?.elo),
    playedAt: new Date(
      typeof entry?.date_raw === "number" ? entry.date_raw * 1000 : entry?.date ?? Date.now()
    ),
  }));
}

export async function getMmrHistoryByRiotId(
  gameName: string,
  tagLine: string,
  count = 5,
  region: ValorantRegion = "kr"
) {
  const profile = await getPlayerByRiotId(gameName, tagLine);
  const history = await getMmrHistoryByPuuid(profile.puuid, count, region);
  return { profile, history };
}

export async function getLeaderboard(
  region: ValorantRegion = "kr",
  platform: ValorantPlatform = "pc",
  size = 10
): Promise<LeaderboardEntry[]> {
  const response = await henrikClient.get(`/v3/leaderboard/${region}/${platform}?size=${size}`);
  const players = asArray<any>(response.data?.data?.players);

  return players.map((player) => ({
    rank: toNumber(player?.leaderboard_rank),
    gameName: toString(player?.name, "익명"),
    tagLine: toString(player?.tag, ""),
    rr: toNumber(player?.rr),
    wins: toNumber(player?.wins),
    tier: toNumber(player?.tier),
    isAnonymized: Boolean(player?.is_anonymized),
  }));
}

export async function getValorantContent(locale = "ko-KR"): Promise<ValorantContentBundle> {
  const response = await henrikClient.get(`/v1/content?locale=${encodeURIComponent(locale)}`);
  const data = response.data?.data ?? {};

  return {
    version: toString(data?.version, "버전 정보 없음"),
    agents: asArray<any>(data?.characters)
      .filter((agent) => agent?.name && !String(agent.name).includes("Null"))
      .map((agent) => ({
        id: toString(agent?.id, ""),
        name: toString(agent?.name, "요원 정보 없음"),
        assetName: toString(agent?.assetName, ""),
      })),
    maps: asArray<any>(data?.maps)
      .filter((map) => map?.name && !String(map.name).includes("Null"))
      .map((map) => ({
        id: toString(map?.id, ""),
        name: toString(map?.name, "맵 정보 없음"),
        assetName: toString(map?.assetName, ""),
      })),
    acts: asArray<any>(data?.acts).map((act) => ({
      id: toString(act?.id, ""),
      parentId: toString(act?.parentId, ""),
      type: toString(act?.type, ""),
      name: toString(act?.name, "정보 없음"),
      isActive: Boolean(act?.isActive),
    })),
  };
}

export async function findAgentByName(name: string, locale = "ko-KR") {
  const content = await getValorantContent(locale);
  const keyword = name.trim().toLowerCase();
  return (
    content.agents.find((agent) => agent.name.toLowerCase() === keyword) ??
    content.agents.find((agent) => agent.name.toLowerCase().includes(keyword))
  );
}

export async function findMapByName(name: string, locale = "ko-KR") {
  const content = await getValorantContent(locale);
  const keyword = name.trim().toLowerCase();
  return (
    content.maps.find((map) => map.name.toLowerCase() === keyword) ??
    content.maps.find((map) => map.name.toLowerCase().includes(keyword))
  );
}

export async function getValorantStatus(
  region: ValorantRegion = "kr"
): Promise<ValorantStatusSummary> {
  const response = await henrikClient.get(`/v1/status/${region}`);
  const data = response.data?.data ?? {};

  const parseItems = (items: unknown) =>
    asArray<any>(items).map((item) => ({
      title: toString(
        item?.titles?.[0]?.content ??
          item?.titles?.[0]?.text ??
          item?.title ??
          item?.updates?.[0]?.translations?.[0]?.content,
        "제목 없음"
      ),
      updatedAt:
        item?.updated_at ??
        item?.updatedAt ??
        item?.updates?.[0]?.updated_at ??
        item?.created_at ??
        undefined,
    }));

  return {
    maintenances: parseItems(data?.maintenances),
    incidents: parseItems(data?.incidents),
  };
}

export async function getQueueStatus(
  region: ValorantRegion = "kr"
): Promise<QueueStatusSummary[]> {
  const response = await henrikClient.get(`/v1/queue-status/${region}`);
  const queues = asArray<any>(response.data?.data);

  return queues.map((queue) => ({
    mode: toString(queue?.mode, "모드 정보 없음"),
    modeId: toString(queue?.mode_id, ""),
    enabled: Boolean(queue?.enabled),
    ranked: Boolean(queue?.ranked),
    maps: asArray<any>(queue?.maps)
      .filter((entry) => entry?.enabled)
      .map((entry) => toString(entry?.map?.name, "맵 정보 없음")),
  }));
}

export async function getVctSchedule(
  league = "vct_pacific",
  limit = 5
): Promise<EsportsMatchSummary[]> {
  const response = await henrikClient.get(
    `/v1/esports/schedule?league=${encodeURIComponent(league)}`
  );
  const matches = asArray<any>(response.data?.data);

  return matches.slice(0, limit).map((item) => {
    const teams = asArray<any>(item?.match?.teams);
    const teamOne = teams[0]?.name ?? "TBD";
    const teamTwo = teams[1]?.name ?? "TBD";
    const winsOne = toNumber(teams[0]?.game_wins);
    const winsTwo = toNumber(teams[1]?.game_wins);

    return {
      leagueName: toString(item?.league?.name, "VCT"),
      leagueCode: toString(item?.league?.identifier, league),
      tournamentName: toString(item?.tournament?.name, "대회 정보 없음"),
      state: toString(item?.state, "정보 없음"),
      startsAt: new Date(item?.date ?? Date.now()),
      teamOne,
      teamTwo,
      score: `${winsOne}-${winsTwo}`,
      vodUrl: item?.vod ?? null,
    };
  });
}
