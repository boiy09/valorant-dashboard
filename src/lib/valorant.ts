import axios from "axios";
import { apiCache, TTL } from "@/lib/apiCache";

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
  rr: number | null;
  rrChange: number | null;
  isCurrent: boolean;
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
  teamScore: number | null;
  enemyScore: number | null;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&");
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

function getTeamScores(match: unknown, puuid: string) {
  const source = asRecord(match);
  const players = asArray<Record<string, unknown>>(source.players);
  const me = players.find((player) => player?.puuid === puuid);
  if (!me) return { teamScore: null, enemyScore: null };

  const teams = asArray<Record<string, unknown>>(source.teams);
  const myTeam = teams.find((team) => team?.team_id === me.team_id);
  const otherTeam = teams.find((team) => team?.team_id !== me.team_id);
  const myTeamRounds = asRecord(myTeam?.rounds);
  const otherTeamRounds = asRecord(otherTeam?.rounds);
  const teamScore = toNumber(myTeam?.rounds_won ?? myTeamRounds.won ?? myTeam?.roundsWon, -1);
  const enemyScore = toNumber(otherTeam?.rounds_won ?? otherTeamRounds.won ?? otherTeam?.roundsWon, -1);

  return {
    teamScore: teamScore >= 0 ? teamScore : null,
    enemyScore: enemyScore >= 0 ? enemyScore : null,
  };
}

function getLatestSeasonWithGames(bySeason: unknown) {
  if (Array.isArray(bySeason)) {
    return bySeason.find((value) => toNumber(asRecord(value).games) > 0) ?? null;
  }

  return Object.entries(asRecord(bySeason))
    .filter(([, value]) => toNumber(asRecord(value).number_of_games) > 0)
    .sort(([a], [b]) => b.localeCompare(a))[0]?.[1] ?? null;
}

async function getRankIconByTier(tierId: number) {
  if (tierId <= 0) return null;

  const { data } = await apiCache.getOrFetch("competitive-tiers:ko-KR", TTL.VERY_LONG, async () => {
    const response = await fetch("https://valorant-api.com/v1/competitivetiers?language=ko-KR");
    const payload = await response.json();
    return payload?.data ?? [];
  });

  const bundles = asArray<Record<string, unknown>>(data);
  for (const bundle of bundles.slice().reverse()) {
    const tiers = asArray<Record<string, unknown>>(bundle.tiers);
    const tier = tiers.find((item) => toNumber(item.tier) === tierId);
    if (typeof tier?.smallIcon === "string" && tier.smallIcon) return tier.smallIcon;
    if (typeof tier?.largeIcon === "string" && tier.largeIcon) return tier.largeIcon;
  }

  return null;
}

async function getAgentIconByName(agentName: string) {
  if (!agentName.trim()) return "";

  const { data } = await apiCache.getOrFetch("agents:en-US", TTL.VERY_LONG, async () => {
    const response = await fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US");
    const payload = await response.json();
    return payload?.data ?? [];
  });

  const keyword = agentName.trim().toLowerCase();
  const agent = asArray<Record<string, unknown>>(data).find(
    (item) => typeof item.displayName === "string" && item.displayName.toLowerCase() === keyword
  );

  return typeof agent?.displayIcon === "string" ? agent.displayIcon : "";
}

async function getOpGgRankFallback(gameName: string, tagLine: string) {
  const slug = `${gameName}-${tagLine}`;
  const url = `https://op.gg/ko/valorant/profile/${encodeURIComponent(slug)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const html = decodeHtml(await response.text());
  const currentTierId = Number(html.match(/"competitiveTier":(\d+)/)?.[1] ?? 0);
  const historyTierId = Number(html.match(/"tierHistories":\[\{"id":\d+,"seasonId":"[^"]+","tierId":(\d+)/)?.[1] ?? 0);
  const tierId = currentTierId || historyTierId;
  if (!tierId) return null;

  const tierPattern = new RegExp(
    `"id":${tierId},"name":"([^"]+)","localizedName":"([^"]+)","division":(\\d+)[^}]*"imageUrl":"([^"]+)"`,
    "i"
  );
  const tierMatch = html.match(tierPattern);
  if (!tierMatch) return null;

  const [, name, localizedName, division, imageUrl] = tierMatch;
  const tierName = division === "0" ? localizedName : `${localizedName} ${division}`;

  return {
    tierId,
    tierName: tierName || name,
    rankIcon: imageUrl,
    isCurrent: currentTierId > 0,
  };
}

export async function getPlayerByRiotId(
  gameName: string,
  tagLine: string
): Promise<PlayerProfile> {
  const key = `account:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
  const { data } = await apiCache.getOrFetch(key, TTL.MEDIUM, async () => {
    const response = await henrikClient.get(
      `/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );
    return response.data?.data;
  });

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
  region: ValorantRegion = "kr",
  riotId?: { gameName: string; tagLine: string }
): Promise<RankData | null> {
  try {
    const [henrikResult, opGgRank] = await Promise.all([
      henrikClient.get(`/v2/by-puuid/mmr/${region}/${puuid}`).catch(() => null),
      riotId ? getOpGgRankFallback(riotId.gameName, riotId.tagLine).catch(() => null) : Promise.resolve(null),
    ]);

    const data = henrikResult?.data?.data;
    const current = asRecord(data?.current ?? data?.current_data);
    const currentTier = asRecord(current.tier);
    const peak = asRecord(data?.peak ?? data?.highest_rank);
    const peakTier = asRecord(peak.tier);
    const latestSeason = asRecord(getLatestSeasonWithGames(data?.seasonal ?? data?.by_season));
    const wins = toNumber(latestSeason.wins ?? data?.wins);
    const games = latestSeason.games || latestSeason.number_of_games
      ? toNumber(latestSeason.games ?? latestSeason.number_of_games)
      : toNumber(data?.wins) + toNumber(data?.losses);
    const currentTierId = toNumber(currentTier.id ?? current.currenttier);
    const tierId = currentTierId || toNumber(opGgRank?.tierId);
    const peakTierId = toNumber(peakTier.id ?? peak.tier);
    const [rankIcon, peakRankIcon] = await Promise.all([
      opGgRank?.rankIcon ? Promise.resolve(opGgRank.rankIcon) : getRankIconByTier(tierId),
      getRankIconByTier(peakTierId),
    ]);
    const tierName = toString(
      currentTierId > 0 ? (currentTier.name ?? current.currenttier_patched) : opGgRank?.tierName,
      "언랭크"
    );
    const rr = currentTierId > 0 ? toNumber(current.rr ?? current.ranking_in_tier) : null;
    const rrChange = currentTierId > 0 ? toNumber(current.last_change ?? current.mmr_change_to_last_game) : null;

    return {
      tier: tierName,
      tierName,
      rr,
      rrChange,
      isCurrent: currentTierId > 0 || Boolean(opGgRank?.isCurrent),
      peakTier: toString(peakTier.name ?? peak.patched_tier, "기록 없음"),
      peakTierName: toString(peakTier.name ?? peak.patched_tier, "기록 없음"),
      wins,
      games: games > 0 ? games : toNumber(latestSeason.number_of_games),
      rankIcon,
      peakRankIcon,
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

  return Promise.all(matches.map(async (match) => {
    const players = asArray<any>(match.players);
    const me = players.find((player) => player?.puuid === puuid) ?? {};
    const stats = me?.stats ?? {};
    const { teamScore, enemyScore } = getTeamScores(match, puuid);
    const agentAssets = asRecord(asRecord(me?.assets).agent);
    const agent = asRecord(me?.agent);
    const agentNestedAssets = asRecord(agent.assets);
    const agentName = toString(me?.agent?.name, "요원 정보 없음");
    const agentIcon = toString(agentAssets.small ?? agentNestedAssets.small ?? agent.small, "");

    return {
      matchId: toString(match?.metadata?.match_id, ""),
      map: toString(match?.metadata?.map?.name, "맵 정보 없음"),
      mode: toString(match?.metadata?.queue?.name, "모드 정보 없음"),
      agent: agentName,
      agentIcon: agentIcon || (await getAgentIconByName(agentName)),
      result: getMatchResult(match, puuid),
      kills: toNumber(stats?.kills),
      deaths: toNumber(stats?.deaths),
      assists: toNumber(stats?.assists),
      score: toNumber(stats?.score),
      teamScore,
      enemyScore,
      headshots: toNumber(stats?.headshots),
      bodyshots: toNumber(stats?.bodyshots),
      legshots: toNumber(stats?.legshots),
      playedAt: new Date(match?.metadata?.started_at ?? Date.now()),
    };
  }));
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
  const key = `mmr-history:${region}:${puuid}`;
  const { data: raw } = await apiCache.getOrFetch(key, TTL.MEDIUM, async () => {
    const response = await henrikClient.get(`/v1/by-puuid/mmr-history/${region}/${puuid}`);
    return response.data?.data;
  });
  const history = asArray<any>(raw).slice(0, count);

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
  const key = `leaderboard:${region}:${platform}:${size}`;
  const { data: raw } = await apiCache.getOrFetch(key, TTL.MEDIUM, async () => {
    const response = await henrikClient.get(`/v3/leaderboard/${region}/${platform}?size=${size}`);
    return response.data?.data?.players;
  });
  const players = asArray<any>(raw);

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
  const key = `content:${locale}`;
  const { data } = await apiCache.getOrFetch(key, TTL.VERY_LONG, async () => {
    const response = await henrikClient.get(`/v1/content?locale=${encodeURIComponent(locale)}`);
    return response.data?.data ?? {};
  });

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
  const key = `status:${region}`;
  const { data } = await apiCache.getOrFetch(key, TTL.SHORT, async () => {
    const response = await henrikClient.get(`/v1/status/${region}`);
    return response.data?.data ?? {};
  });

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
  const key = `vct:${league}`;
  const { data: raw } = await apiCache.getOrFetch(key, TTL.LONG, async () => {
    const response = await henrikClient.get(
      `/v1/esports/schedule?league=${encodeURIComponent(league)}`
    );
    return response.data?.data;
  });
  const matches = asArray<any>(raw);

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
