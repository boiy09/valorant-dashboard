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

async function getAccountByPuuid(puuid: string) {
  if (!puuid) return null;
  const key = `match-account:puuid:v2:${puuid}`;
  const { data } = await apiCache.getOrFetch(key, MATCH_TTL, async () => {
    const henrikResponse = await henrikClient.get(`/v2/by-puuid/account/${puuid}`).catch(() =>
      henrikClient.get(`/v1/by-puuid/account/${puuid}`).catch(() => null)
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

async function getRankIconByTier(tierId: number) {
  if (tierId <= 0) return null;

  const { data } = await apiCache.getOrFetch("match-competitive-tiers:ko-KR", MATCH_TTL, async () => {
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

async function getCurrentRankByPuuid(puuid: string) {
  if (!puuid) return null;
  const key = `match-current-rank:v2:${puuid}`;
  const { data } = await apiCache.getOrFetch(key, MATCH_TTL, async () => {
    for (const region of ["kr", "ap", "na", "eu", "latam", "br"] as const) {
      const response = await henrikClient.get(`/v3/by-puuid/mmr/${region}/pc/${puuid}`).catch(() =>
        henrikClient.get(`/v2/by-puuid/mmr/${region}/${puuid}`).catch(() => null)
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
    tierName: firstString(tier.name, current.currenttierpatched, data?.currenttierpatched) || "Unranked",
    tierIcon: await getRankIconByTier(tierId),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const cacheKey = `match:v4:${matchId}`;

  const cached = apiCache.get<object>(cacheKey, MATCH_TTL);
  if (cached) return Response.json(cached);

  try {
    const res = await henrikClient.get(`/v4/match/${matchId}`);
    const data = res.data?.data;
    const metadata = asRecord(data?.metadata);
    const players = asArray<Record<string, unknown>>(data?.players);
    const teams = asArray<Record<string, unknown>>(data?.teams);
    const rounds = asArray<Record<string, unknown>>(data?.rounds);

    const totalRounds = teams.reduce(
      (sum, team) => sum + toNumber(team.rounds_won),
      0
    );

    const processedPlayers = await Promise.all(players.map(async (player) => {
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
      const assets = asRecord(player.assets);
      const card = asRecord(player.card ?? player.player_card ?? assets.card);
      const puuid = firstString(player.puuid);
      const agentName = firstString(agent.name, player.character_name, "Unknown");
      const rawName = firstString(player.game_name, player.gameName, player.name, player.player_name, player.playerName);
      const rawNameIsUsable = !isAgentName(rawName, agentName) && !isPrivateLikeName(rawName);
      const localName = firstPlayerName(agentName, player.game_name, player.gameName, player.name, player.player_name, player.playerName);
      const localTag = firstString(player.tag, player.tagLine, player.tag_line, player.game_tag);
      const matchTierId = toNumber(tier.id);

      // 계정·랭크 fallback을 병렬로 요청
      const [accountFallback, rankFallback] = await Promise.all([
        !localName || !localTag || !rawNameIsUsable ? getAccountByPuuid(puuid).catch(() => null) : Promise.resolve(null),
        matchTierId <= 0 ? getCurrentRankByPuuid(puuid).catch(() => null) : Promise.resolve(null),
      ]);

      const fallbackCard = asRecord(accountFallback?.card);
      const fallbackName = firstPlayerName(
        agentName,
        accountFallback?.game_name,
        accountFallback?.gameName,
        accountFallback?.name
      );
      const displayName = localName || fallbackName || rawName;
      const displayTag = localTag || firstString(accountFallback?.tag, accountFallback?.tagLine, accountFallback?.tag_line);
      const isPrivate = !localName && !fallbackName && !rawNameIsUsable;
      const finalTierId = matchTierId || rankFallback?.tierId || 0;
      const finalTierName =
        matchTierId > 0 ? firstString(tier.name) || "Unranked" : rankFallback?.tierName ?? "Unranked";
      const finalTierIcon = rankFallback?.tierIcon ?? (await getRankIconByTier(finalTierId));

      return {
        puuid,
        name: isPrivate ? "비공개" : displayName,
        tag: isPrivate ? "" : displayTag,
        isPrivate,
        teamId: player.team_id,
        level: toNumber(player.level ?? player.account_level, -1) >= 0 ? toNumber(player.level ?? player.account_level) : null,
        cardIcon:
          (card.small as string) ??
          (card.wide as string) ??
          (card.large as string) ??
          (card.displayIcon as string) ??
          (assets.card_small as string) ??
          (fallbackCard.small as string) ??
          (fallbackCard.wide as string) ??
          (fallbackCard.large as string) ??
          "",
        agent: agentName,
        agentIcon,
        tierName: finalTierName,
        tierId: finalTierId,
        tierIcon: finalTierIcon,
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
    }));

    const processedTeams = teams.map((team) => ({
      teamId: team.team_id as string,
      roundsWon: toNumber(team.rounds_won),
      won: Boolean(team.won),
    }));

    const processedRounds = rounds.map((round, index) => {
      const winningTeam = asRecord(round.winning_team ?? round.winningTeam);
      const resultInfo = asRecord(round.result);
      const ceremony = asRecord(round.ceremony);

      return {
        round: toNumber(round.round ?? round.round_number ?? round.roundNumber, index + 1),
        winningTeamId:
          (round.winning_team_id as string) ??
          (round.winningTeamId as string) ??
          (winningTeam.team_id as string) ??
          (winningTeam.teamId as string) ??
          "",
        result:
          (resultInfo.code as string) ??
          (resultInfo.name as string) ??
          (round.result_code as string) ??
          (round.result as string) ??
          "",
        ceremony:
          (ceremony.code as string) ??
          (ceremony.name as string) ??
          (round.ceremony as string) ??
          "",
      };
    });

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
      rounds: processedRounds,
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
