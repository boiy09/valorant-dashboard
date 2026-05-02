import axios from "axios";

const riotClient = axios.create({
  baseURL: "https://kr.api.riotgames.com",
  headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
});

const henriClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
});

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
  rankIcon?: string;
  peakRankIcon?: string;
}

export interface MatchStats {
  matchId: string;
  map: string;
  mode: string;
  agent: string;
  agentIcon: string;
  result: "승리" | "패배" | "무승부";
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
  playedAt: Date;
}

export async function getPlayerByRiotId(
  gameName: string,
  tagLine: string
): Promise<PlayerProfile> {
  const res = await henriClient.get(`/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  const d = res.data.data;
  return {
    puuid: d.puuid,
    gameName: d.name,
    tagLine: d.tag,
    accountLevel: d.account_level,
    card: d.card?.small,
  };
}

export async function getRankByPuuid(puuid: string): Promise<RankData | null> {
  try {
    const res = await henriClient.get(`/v2/by-puuid/mmr/kr/${puuid}`);
    const d = res.data.data;
    const current = d.current_data;
    const peak = d.highest_rank;
    return {
      tier: current.currenttier_patched ?? "언랭크",
      tierName: current.currenttier_patched ?? "언랭크",
      rr: current.ranking_in_tier ?? 0,
      peakTier: peak?.patched_tier ?? "없음",
      peakTierName: peak?.patched_tier ?? "없음",
      wins: d.wins ?? 0,
      games: (d.wins ?? 0) + (d.losses ?? 0),
      rankIcon: current.images?.small ?? null,
      peakRankIcon: peak?.images?.small ?? null,
    };
  } catch {
    return null;
  }
}

export async function getRecentMatches(
  puuid: string,
  count = 5
): Promise<MatchStats[]> {
  const res = await henriClient.get(
    `/v3/by-puuid/matches/kr/${puuid}?size=${count}`
  );
  const matches = res.data.data as any[];
  return matches.map((m) => {
    const player = m.players.all_players.find((p: any) => p.puuid === puuid);
    const myTeam = player?.team?.toLowerCase();
    const myTeamData = m.teams?.[myTeam];
    const won = myTeamData?.has_won;

    const totalShots =
      (player?.stats?.headshots ?? 0) +
      (player?.stats?.bodyshots ?? 0) +
      (player?.stats?.legshots ?? 0);

    return {
      matchId: m.metadata.matchid,
      map: m.metadata.map,
      mode: m.metadata.mode,
      agent: player?.character ?? "알 수 없음",
      agentIcon: player?.assets?.agent?.small ?? "",
      result: won ? "승리" : m.teams?.red?.has_won === m.teams?.blue?.has_won ? "무승부" : "패배",
      kills: player?.stats?.kills ?? 0,
      deaths: player?.stats?.deaths ?? 0,
      assists: player?.stats?.assists ?? 0,
      score: player?.stats?.score ?? 0,
      headshots: player?.stats?.headshots ?? 0,
      bodyshots: player?.stats?.bodyshots ?? 0,
      legshots: player?.stats?.legshots ?? 0,
      playedAt: new Date(m.metadata.game_start * 1000),
    };
  });
}

export async function getPlayerStats(
  gameName: string,
  tagLine: string
): Promise<{ profile: PlayerProfile; rank: RankData | null; recentMatches: MatchStats[] }> {
  const profile = await getPlayerByRiotId(gameName, tagLine);
  const [rank, recentMatches] = await Promise.all([
    getRankByPuuid(profile.puuid),
    getRecentMatches(profile.puuid, 5),
  ]);
  return { profile, rank, recentMatches };
}
