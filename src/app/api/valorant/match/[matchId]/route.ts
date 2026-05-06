import { NextRequest } from "next/server";
import axios from "axios";
import { apiCache } from "@/lib/apiCache";

const MATCH_TTL = 7 * 24 * 60 * 60 * 1000; // 7일 (매치는 불변)

const henrikClient = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
  timeout: 15000,
});

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const cacheKey = `match:${matchId}`;

  const cached = apiCache.get<object>(cacheKey, MATCH_TTL);
  if (cached) return Response.json(cached);

  try {
    const res = await henrikClient.get(`/v4/match/${matchId}`);
    const data = res.data?.data;
    const metadata = asRecord(data?.metadata);
    const players = asArray<Record<string, unknown>>(data?.players);
    const teams = asArray<Record<string, unknown>>(data?.teams);

    const totalRounds = teams.reduce(
      (sum, team) => sum + toNumber(team.rounds_won),
      0
    );

    const processedPlayers = players.map((player) => {
      const stats = asRecord(player.stats);
      const kills = toNumber(stats.kills);
      const deaths = toNumber(stats.deaths);
      const assists = toNumber(stats.assists);
      const headshots = toNumber(stats.headshots);
      const bodyshots = toNumber(stats.bodyshots);
      const legshots = toNumber(stats.legshots);
      const score = toNumber(stats.score);
      const damage = asRecord(stats.damage);
      const totalShots = headshots + bodyshots + legshots;
      const damageDealt = toNumber(damage.made);

      const agent = asRecord(player.agent);
      const agentAssets = asRecord(asRecord(player.assets).agent);
      const agentNestedAssets = asRecord(agent.assets);
      const agentIcon =
        (agentAssets.small as string) ??
        (agentNestedAssets.small as string) ??
        (agent.small as string) ??
        "";

      const tier = asRecord(player.tier);
      const economy = asRecord(player.economy);

      return {
        puuid: player.puuid,
        name: player.name,
        tag: player.tag,
        teamId: player.team_id,
        agent: (agent.name as string) ?? "Unknown",
        agentIcon,
        tierName: (tier.name as string) ?? "Unranked",
        tierId: toNumber(tier.id),
        acs: totalRounds > 0 ? Math.round(score / totalRounds) : 0,
        kills,
        deaths,
        assists,
        plusMinus: kills - deaths,
        kd: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills,
        hsPercent: totalShots > 0 ? Math.round((headshots / totalShots) * 100) : 0,
        adr: totalRounds > 0 && damageDealt > 0 ? Math.round(damageDealt / totalRounds) : null,
        spentCredits: toNumber(economy.spent),
      };
    });

    const processedTeams = teams.map((team) => ({
      teamId: team.team_id as string,
      roundsWon: toNumber(team.rounds_won),
      won: Boolean(team.won),
    }));

    const mapInfo = asRecord(data?.metadata?.map ?? metadata.map);
    const queueInfo = asRecord(data?.metadata?.queue ?? metadata.queue);

    const result = {
      matchId,
      map: (mapInfo.name as string) ?? "Unknown",
      mode: (queueInfo.name as string) ?? "Unknown",
      startedAt: metadata.started_at,
      gameLengthMs: toNumber(metadata.game_length_in_ms ?? metadata.game_length),
      totalRounds,
      players: processedPlayers,
      teams: processedTeams,
    };
    apiCache.set(cacheKey, result);
    return Response.json(result);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404) {
        return Response.json({ error: "매치 데이터를 찾을 수 없습니다. (커스텀 게임이거나 오래된 매치일 수 있습니다)" }, { status: 404 });
      }
      if (status === 429) {
        return Response.json({ error: "API 요청 한도 초과. 잠시 후 다시 시도해 주세요." }, { status: 429 });
      }
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
