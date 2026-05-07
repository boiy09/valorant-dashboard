import axios from "axios";
import { apiCache, TTL } from "@/lib/apiCache";
import { getOpGgRankFallback } from "@/lib/opgg";

const henrikClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
  timeout: 15000,
});

// Henrik free tier rate limit guard: max 3 concurrent requests
const _hq = { n: 0, q: [] as Array<() => void> };
async function henrikGet(path: string) {
  if (_hq.n >= 3) await new Promise<void>(r => _hq.q.push(r));
  _hq.n++;
  try {
    return await henrikClient.get(path);
  } finally {
    _hq.n--;
    _hq.q.shift()?.();
  }
}

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
  tierId: number;
  rr: number | null;
  rrChange: number | null;
  isCurrent: boolean;
  peakTier: string;
  peakTierName: string;
  wins: number;
  games: number;
  rankIcon?: string | null;
  peakRankIcon?: string | null;
  currentSeason: RankSeasonSummary | null;
  previousSeason: RankSeasonSummary | null;
  peakSeason: RankSeasonSummary | null;
}

export interface RankSeasonSummary {
  season: string;
  label: string;
  tierId: number;
  tierName: string;
  wins: number;
  games: number;
  rankIcon?: string | null;
}

export interface ScoreboardPlayer {
  puuid: string;
  name: string;
  tag: string;
  isPrivate: boolean;
  teamId: string;
  level: number | null;
  cardIcon: string;
  agent: string;
  agentIcon: string;
  tierName: string;
  tierId: number;
  tierIcon: string | null;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  plusMinus: number;
  kd: number;
  hsPercent: number;
  adr: number | null;
}

export interface ScoreboardTeam {
  teamId: string;
  roundsWon: number;
  won: boolean;
}

export interface MatchRoundSummary {
  round: number;
  winningTeamId: string;
  result: string;
  ceremony: string;
}

export interface MatchScoreboardData {
  map: string;
  mode: string;
  startedAt: string;
  gameLengthMs: number;
  totalRounds: number;
  players: ScoreboardPlayer[];
  teams: ScoreboardTeam[];
  rounds: MatchRoundSummary[];
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
  scoreboard: MatchScoreboardData | null;
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function isPrivateLikeName(value: unknown) {
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "private" ||
    normalized === "hidden" ||
    normalized === "anonymous" ||
    normalized === "unknown" ||
    normalized === "player" ||
    normalized === "비공개" ||
    normalized.includes("비공개") ||
    normalized.includes("익명")
  );
}

function normalizeTeamId(value: unknown) {
  return toString(value, "").trim().toLowerCase();
}

function splitRiotId(value: string) {
  const [name, tag] = value.split("#");
  return {
    name: name?.trim() ?? "",
    tag: tag?.trim() ?? "",
  };
}

function isAgentName(value: string, agentName: string) {
  return Boolean(value) && value.trim().toLowerCase() === agentName.trim().toLowerCase();
}

function firstPlayerName(agentName: string, ...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (isPrivateLikeName(name) || isAgentName(name, agentName)) continue;
    return name;
  }
  return "";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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

function seasonLabel(season: string) {
  const match = season.match(/e(\d+)a(\d+)/i);
  return match ? `에피소드 ${match[1]} 액트 ${match[2]}` : season || "시즌 정보 없음";
}

function getSeasonGames(record: Record<string, unknown>) {
  return toNumber(record.games ?? record.number_of_games ?? record.numberOfGames);
}

function getSeasonWins(record: Record<string, unknown>) {
  return toNumber(record.wins ?? record.number_of_wins ?? record.numberOfWins);
}

function getSeasonTierId(record: Record<string, unknown>) {
  return toNumber(record.final_rank ?? record.finalRank ?? record.tier ?? record.rank);
}

function getSeasonTierName(record: Record<string, unknown>, tierId: number) {
  return toString(
    record.final_rank_patched ??
      record.finalRankPatched ??
      record.rank_patched ??
      record.rankName ??
      record.patched_tier,
    tierId > 0 ? "랭크 정보" : "언랭크"
  );
}

function getSeasonEntries(bySeason: unknown) {
  if (Array.isArray(bySeason)) {
    return bySeason
      .map((value, index) => {
        const record = asRecord(value);
        const season = firstString(record.season, record.season_id, record.seasonId) || `season-${index}`;
        return { season, record };
      })
      .filter(({ record }) => getSeasonGames(record) > 0)
      .sort((a, b) => b.season.localeCompare(a.season));
  }

  return Object.entries(asRecord(bySeason))
    .map(([season, value]) => ({ season, record: asRecord(value) }))
    .filter(({ record }) => getSeasonGames(record) > 0)
    .sort((a, b) => b.season.localeCompare(a.season));
}

function getLatestSeasonWithGames(bySeason: unknown) {
  return getSeasonEntries(bySeason)[0]?.record ?? null;
}

async function buildSeasonSummary(season: string, record: Record<string, unknown>): Promise<RankSeasonSummary | null> {
  const games = getSeasonGames(record);
  if (games <= 0) return null;

  const tierId = getSeasonTierId(record);
  return {
    season,
    label: seasonLabel(season),
    tierId,
    tierName: getSeasonTierName(record, tierId),
    wins: getSeasonWins(record),
    games,
    rankIcon: await getRankIconByTier(tierId),
  };
}

function getPlayerCardIcon(player: Record<string, unknown>) {
  const assets = asRecord(player.assets);
  const card = asRecord(player.card ?? player.player_card ?? assets.card);
  const account = asRecord(player.account);
  const accountCard = asRecord(account.card);
  const customization = asRecord(player.customization);
  const cardId = firstString(
    player.card,
    player.player_card,
    player.playerCard,
    player.player_card_id,
    player.playerCardId,
    customization.card,
    card.id,
    card.uuid,
    account.card
  );
  const directUrl = firstString(
    card.small ??
      card.wide ??
      card.large ??
      card.displayIcon ??
      card.smallArt ??
      card.wideArt ??
      card.largeArt ??
      accountCard.small ??
      accountCard.wide ??
      accountCard.large ??
      assets.card_small ??
      assets.player_card_small ??
      assets.playerCardSmall
  );
  if (directUrl) return directUrl;
  if (/^[0-9a-f-]{36}$/i.test(cardId)) {
    return `https://media.valorant-api.com/playercards/${cardId}/smallart.png`;
  }
  return "";
}

async function getAccountByPuuid(puuid: string) {
  if (!puuid) return null;
  const key = `account:puuid:v2:${puuid}`;
  const { data } = await apiCache.getOrFetch(key, TTL.VERY_LONG, async () => {
    const henrikResponse = await henrikGet(`/v2/by-puuid/account/${puuid}`).catch(() =>
      henrikGet(`/v1/by-puuid/account/${puuid}`).catch(() => null)
    );
    if (henrikResponse?.data?.data) return henrikResponse.data.data;

    if (!process.env.RIOT_API_KEY) return null;
    for (const routing of ["asia", "americas", "europe"] as const) {
      const response = await fetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`, {
        headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) continue;
      const account = await response.json();
      if (account?.gameName) {
        return {
          name: account.gameName,
          game_name: account.gameName,
          tag: account.tagLine,
          tagLine: account.tagLine,
        };
      }
    }
    return null;
  });
  return asRecord(data);
}

const RANK_REGION_CANDIDATES: ValorantRegion[] = ["kr", "ap", "na", "eu", "latam", "br"];

export async function getRankIconByTier(tierId: number) {
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

async function getScoreboardRankByPuuid(puuid: string, region: ValorantRegion) {
  if (!puuid) return null;
  const key = `scoreboard-rank:v2:${region}:${puuid}`;
  const { data } = await apiCache.getOrFetch(key, TTL.VERY_LONG, async () => {
    for (const candidate of [region, ...RANK_REGION_CANDIDATES.filter((item) => item !== region)]) {
      const response = await henrikGet(`/v3/by-puuid/mmr/${candidate}/pc/${puuid}`).catch(() =>
        henrikGet(`/v2/by-puuid/mmr/${candidate}/${puuid}`).catch(() => null)
      );
      if (response?.data?.data) return response.data.data;
    }
    return null;
  });
  const current = asRecord(data?.current ?? data?.current_data);
  const tier = asRecord(current.tier);
  const tierId = toNumber(tier.id ?? current.currenttier ?? data?.currenttier);
  if (tierId <= 0) return null;
  return {
    tierId,
    tierName: toString(tier.name ?? current.currenttierpatched ?? data?.currenttierpatched, "Unranked"),
    tierIcon: await getRankIconByTier(tierId),
  };
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

export async function getPlayerByRiotId(
  gameName: string,
  tagLine: string
): Promise<PlayerProfile> {
  const key = `account:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
  const { data } = await apiCache.getOrFetch(key, TTL.MEDIUM, async () => {
    const encodedName = encodeURIComponent(gameName);
    const encodedTag = encodeURIComponent(tagLine);
    const response =
      (await henrikGet(`/v2/account/${encodedName}/${encodedTag}`).catch(() => null)) ??
      (await henrikGet(`/v1/account/${encodedName}/${encodedTag}`).catch(() => null));
    return response?.data?.data;
  });
  const account = asRecord(data);
  const fallback = account?.puuid ? await getAccountByPuuid(toString(account.puuid, "")).catch(() => null) : null;
  const fallbackCard = asRecord(fallback?.card);
  const card =
    getPlayerCardIcon(account) ||
    firstString(fallbackCard.small, fallbackCard.smallArt, fallbackCard.wide, fallbackCard.large);

  return {
    puuid: toString(account.puuid, ""),
    gameName: toString(account.name ?? account.gameName ?? account.game_name, gameName),
    tagLine: toString(account.tag ?? account.tagLine ?? account.tag_line, tagLine),
    accountLevel: toNumber(
      account.account_level ?? account.accountLevel ?? account.level ?? fallback?.account_level ?? fallback?.accountLevel,
      -1
    ),
    card: card || undefined,
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
    const seasonalSource = data?.seasonal ?? data?.by_season;
    const latestSeason = asRecord(getLatestSeasonWithGames(seasonalSource));
    const seasonSummaries = (
      await Promise.all(getSeasonEntries(seasonalSource).map(({ season, record }) => buildSeasonSummary(season, record)))
    ).filter((item): item is RankSeasonSummary => Boolean(item));
    const currentSeason = seasonSummaries[0] ?? null;
    const previousSeason = seasonSummaries[1] ?? null;
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
      currentTierId > 0 ? (currentTier.name ?? current.currenttierpatched) : opGgRank?.tierName,
      "언랭크"
    );
    const rr = currentTierId > 0 ? toNumber(current.rr ?? current.ranking_in_tier) : null;
    const rrChange = currentTierId > 0 ? toNumber(current.last_change ?? current.mmr_change_to_last_game) : null;
    const peakSeason = seasonSummaries.reduce<RankSeasonSummary | null>(
      (best, item) => (!best || item.tierId > best.tierId ? item : best),
      null
    );

    return {
      tier: tierName,
      tierName,
      tierId,
      rr,
      rrChange,
      isCurrent: currentTierId > 0 || Boolean(opGgRank?.isCurrent),
      peakTier: toString(peakTier.name ?? peak.patched_tier, "기록 없음"),
      peakTierName: toString(peakTier.name ?? peak.patched_tier, "기록 없음"),
      wins,
      games: games > 0 ? games : toNumber(latestSeason.number_of_games),
      rankIcon,
      peakRankIcon,
      currentSeason,
      previousSeason,
      peakSeason,
    };
  } catch {
    return null;
  }
}

export interface RecentMatchesOptions {
  puuidRankMap?: Map<string, { tierId: number; tierName: string; tierIcon?: string | null }>;
  skipAccountFallback?: boolean;
  skipRankFallback?: boolean;
}

export async function getRecentMatches(
  puuid: string,
  count = 5,
  region: ValorantRegion = "kr",
  platform: ValorantPlatform = "pc",
  options?: RecentMatchesOptions
): Promise<MatchStats[]> {
  const response = await henrikClient.get(
    `/v4/by-puuid/matches/${region}/${platform}/${puuid}?size=${count}`
  );
  const matches = asArray<any>(response.data?.data);

  return Promise.all(matches.map(async (match) => {
    const players = asArray<any>(match.players);
    const teams = asArray<any>(match.teams);
    const me = players.find((player) => player?.puuid === puuid) ?? {};
    const stats = me?.stats ?? {};
    const { teamScore, enemyScore } = getTeamScores(match, puuid);
    const agentAssets = asRecord(asRecord(me?.assets).agent);
    const agent = asRecord(me?.agent);
    const agentNestedAssets = asRecord(agent.assets);
    const agentName = toString(me?.agent?.name, "요원 정보 없음");
    const agentIcon = firstString(
      agentAssets.small,
      agentAssets.displayIcon,
      agentAssets.fullPortrait,
      agentNestedAssets.small,
      agentNestedAssets.displayIcon,
      agentNestedAssets.fullPortrait,
      agent.small,
      agent.displayIcon,
      agent.fullPortrait
    );

    function teamRoundsWon(t: any): number {
      return toNumber(t.rounds_won ?? asRecord(t.rounds).won ?? t.roundsWon);
    }
    const totalRounds = teams.reduce((sum: number, t: any) => sum + teamRoundsWon(t), 0);
    const rawRounds = asArray<Record<string, unknown>>(match.rounds);
    const scoreboardRounds = rawRounds.map((round, index) => {
      const winningTeamRaw = round.winning_team ?? round.winningTeam ?? round.winner;
      const winningTeam = asRecord(winningTeamRaw);
      const result = asRecord(round.result);
      const ceremony = asRecord(round.ceremony);

      return {
        round: toNumber(round.round ?? round.round_number ?? round.roundNumber, index + 1),
        winningTeamId: normalizeTeamId(
          firstString(
            round.winning_team_id,
            round.winningTeamId,
            round.winner_team_id,
            round.winnerTeamId,
            typeof winningTeamRaw === "string" ? winningTeamRaw : "",
            winningTeam.team_id,
            winningTeam.teamId,
            winningTeam.id,
            winningTeam.name
          )
        ),
        result: toString(result.code ?? result.name ?? round.result_code ?? round.result, ""),
        ceremony: toString(ceremony.code ?? ceremony.name ?? round.ceremony, ""),
      };
    });

    const scoreboardPlayers: ScoreboardPlayer[] = await Promise.all(players.map(async (p: any) => {
      const ps = asRecord(p.stats ?? {});
      const pk = toNumber(ps.kills);
      const pd = toNumber(ps.deaths);
      const pa = toNumber(ps.assists);
      const phs = toNumber(ps.headshots);
      const pbs = toNumber(ps.bodyshots);
      const pls = toNumber(ps.legshots);
      const pScore = toNumber(ps.score);
      const totalShots = phs + pbs + pls;
      const pPuuid = toString(p.puuid, "");
      const pAssets = asRecord(asRecord(p.assets ?? {}).agent ?? {});
      const pAgent = asRecord(p.agent ?? {});
      const pAgentNested = asRecord(pAgent.assets ?? {});
      const pAgentName = toString(pAgent.name ?? p.character?.name ?? p.character_name, "Unknown");
      const pIcon =
        firstString(
          pAssets.small,
          pAssets.displayIcon,
          pAssets.fullPortrait,
          pAssets.bust,
          pAgentNested.small,
          pAgentNested.displayIcon,
          pAgentNested.fullPortrait,
          pAgentNested.bust,
          pAgent.small,
          pAgent.displayIcon,
          pAgent.fullPortrait
        ) || (await getAgentIconByName(pAgentName));
      const pTier = asRecord(p.tier ?? {});
      const pAccount = asRecord(p.account ?? {});
      const pPlayer = asRecord(p.player ?? {});
      const pIdentity = asRecord(p.identity ?? {});
      const pRiotId = asRecord(p.riotId ?? p.riot_id);
      const riotId = splitRiotId(
        firstString(
          p.riot_id,
          p.riotId,
          p.display_name,
          p.displayName,
          p.player_name,
          p.playerName,
          pAccount.riot_id,
          pAccount.riotId,
          pAccount.display_name,
          pAccount.displayName,
          pPlayer.riot_id,
          pPlayer.riotId,
          pPlayer.display_name,
          pPlayer.displayName,
          pIdentity.riot_id,
          pIdentity.riotId,
          pIdentity.display_name,
          pIdentity.displayName
        )
      );
      const localName = firstPlayerName(
        pAgentName,
        p.game_name,
        p.gameName,
        p.name,
        p.player_name,
        p.playerName,
        pAccount.game_name,
        pAccount.gameName,
        pAccount.name,
        pPlayer.game_name,
        pPlayer.gameName,
        pPlayer.name,
        pIdentity.game_name,
        pIdentity.gameName,
        pIdentity.name,
        pRiotId.gameName,
        pRiotId.game_name,
        pRiotId.name,
        riotId.name
      );
      const localTag = firstString(
        p.tag,
        p.game_tag,
        p.tagLine,
        p.tag_line,
        pAccount.tag,
        pAccount.game_tag,
        pAccount.tagLine,
        pAccount.tag_line,
        pPlayer.tag,
        pPlayer.game_tag,
        pPlayer.tagLine,
        pPlayer.tag_line,
        pIdentity.tag,
        pIdentity.game_tag,
        pIdentity.tagLine,
        pIdentity.tag_line,
        pRiotId.tagLine,
        pRiotId.tag_line,
        pRiotId.tag,
        riotId.tag
      );
      const localCardIcon = getPlayerCardIcon(p);
      const rawName = firstString(p.game_name, p.gameName, p.name, p.player_name, p.playerName);
      const rawNameIsAgent = isAgentName(rawName, pAgentName);
      const rawNameIsUsable = !rawNameIsAgent && !isPrivateLikeName(rawName);
      const needsAccountFallback = !options?.skipAccountFallback && (!localName || !localTag || !localCardIcon || !rawNameIsUsable);
      const accountFallback = needsAccountFallback
        ? await getAccountByPuuid(pPuuid).catch(() => null)
        : null;
      const fallbackCard = asRecord(accountFallback?.card);
      const pName = localName || firstPlayerName(pAgentName, accountFallback?.game_name, accountFallback?.gameName, accountFallback?.name);
      const pTag = localTag || firstString(accountFallback?.tag, accountFallback?.tagLine, accountFallback?.tag_line);
      const isPrivate = !pName && !rawNameIsUsable;
      const displayName = pName || rawName;
      const pCardIcon = localCardIcon || firstString(fallbackCard.small, fallbackCard.wide, fallbackCard.large);
      const pTeamId = normalizeTeamId(p.team_id ?? p.teamId ?? p.team);
      const pTierId = toNumber(pTier.id);
      const mappedRank = pTierId <= 0 ? (options?.puuidRankMap?.get(pPuuid) ?? null) : null;
      const fallbackRank = pTierId <= 0 && !mappedRank && !options?.skipRankFallback
        ? await getScoreboardRankByPuuid(pPuuid, region).catch(() => null)
        : null;
      const rankData = mappedRank ?? fallbackRank;
      const finalTierId = pTierId || rankData?.tierId || 0;
      const finalTierName = pTierId > 0 ? toString(pTier.name, "Unranked") : rankData?.tierName ?? "Unranked";
      return {
        puuid: pPuuid,
        name: isPrivate ? "비공개" : displayName,
        tag: isPrivate ? "" : pTag,
        isPrivate,
        teamId: pTeamId,
        level: toNumber(p.level ?? p.account_level, -1) >= 0 ? toNumber(p.level ?? p.account_level) : null,
        cardIcon: pCardIcon,
        agent: pAgentName,
        agentIcon: pIcon,
        tierName: finalTierName,
        tierId: finalTierId,
        tierIcon: rankData?.tierIcon ?? (await getRankIconByTier(finalTierId)),
        acs: totalRounds > 0 ? Math.round(pScore / totalRounds) : 0,
        kills: pk,
        deaths: pd,
        assists: pa,
        plusMinus: pk - pd,
        kd: pd > 0 ? Math.round((pk / pd) * 100) / 100 : pk,
        hsPercent: totalShots > 0 ? Math.round((phs / totalShots) * 100) : 0,
        adr: null,
      };
    }));

    const scoreboardTeams: ScoreboardTeam[] = teams.map((t: any) => ({
      teamId: normalizeTeamId(t.team_id ?? t.teamId ?? t.team),
      roundsWon: teamRoundsWon(t),
      won: Boolean(t.won ?? t.has_won),
    }));

    const scoreboard: MatchScoreboardData = {
      map: toString(match?.metadata?.map?.name, "맵 정보 없음"),
      mode: toString(match?.metadata?.queue?.name, "모드 정보 없음"),
      startedAt: toString(match?.metadata?.started_at, ""),
      gameLengthMs: toNumber(match?.metadata?.game_length_in_ms ?? match?.metadata?.game_length),
      totalRounds,
      players: scoreboardPlayers,
      teams: scoreboardTeams,
      rounds: scoreboardRounds,
    };

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
      score: totalRounds > 0 ? Math.round(toNumber(stats?.score) / totalRounds) : 0,
      teamScore,
      enemyScore,
      headshots: toNumber(stats?.headshots),
      bodyshots: toNumber(stats?.bodyshots),
      legshots: toNumber(stats?.legshots),
      playedAt: new Date(match?.metadata?.started_at ?? Date.now()),
      scoreboard,
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
