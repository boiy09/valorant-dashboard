import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import axios from "axios";

const henri = axios.create({
  baseURL: "https://api.henrikdev.xyz/valorant",
  headers: { Authorization: process.env.HENRIK_API_KEY },
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const gameName = req.nextUrl.searchParams.get("gameName");
  const tagLine = req.nextUrl.searchParams.get("tagLine");
  if (!gameName || !tagLine) return Response.json({ error: "gameName, tagLine 필요" }, { status: 400 });

  try {
    console.log(`[tracker] 요청: ${gameName}#${tagLine}`);
    const profileRes = await henri.get(`/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
    const puuid = profileRes.data.data.puuid;
    console.log(`[tracker] PUUID: ${puuid}`);

    // kr 먼저 시도, 없으면 ap
    let matchesRes = await henri.get(`/v3/by-puuid/matches/kr/${puuid}?size=20`);
    let region = "kr";
    if (!matchesRes.data.data?.length) {
      const apRes = await henri.get(`/v3/by-puuid/matches/ap/${puuid}?size=20`).catch(() => null);
      if (apRes?.data?.data?.length) { matchesRes = apRes; region = "ap"; }
    }
    console.log(`[tracker] 매치 수: ${matchesRes.data.data?.length ?? 0} (region: ${region})`);

    const mmrRes = await henri.get(`/v2/by-puuid/mmr/${region}/${puuid}`).catch(() => null);

    const matches: any[] = matchesRes.data.data ?? [];

    let totalKills = 0, totalDeaths = 0;
    let totalHeadshots = 0, totalBodyshots = 0, totalLegshots = 0;
    let totalScore = 0, totalDamage = 0, totalRounds = 0, wins = 0;
    const agentMap: Record<string, {
      name: string; imageUrl: string;
      kills: number; deaths: number; damage: number; rounds: number; wins: number; matches: number;
    }> = {};

    for (const m of matches) {
      const player = m.players?.all_players?.find((p: any) => p.puuid === puuid);
      if (!player) continue;

      const myTeam = player.team?.toLowerCase();
      const teamData = m.teams?.[myTeam];
      const rounds = (teamData?.rounds_won ?? 0) + (teamData?.rounds_lost ?? 0);
      const won = teamData?.has_won ?? false;

      totalKills += player.stats?.kills ?? 0;
      totalDeaths += player.stats?.deaths ?? 0;
      totalHeadshots += player.stats?.headshots ?? 0;
      totalBodyshots += player.stats?.bodyshots ?? 0;
      totalLegshots += player.stats?.legshots ?? 0;
      totalScore += player.stats?.score ?? 0;
      totalDamage += player.damage_made ?? 0;
      totalRounds += rounds;
      if (won) wins++;

      const agentName = player.character ?? "Unknown";
      if (!agentMap[agentName]) {
        agentMap[agentName] = {
          name: agentName,
          imageUrl: player.assets?.agent?.small ?? "",
          kills: 0, deaths: 0, damage: 0, rounds: 0, wins: 0, matches: 0,
        };
      }
      const ag = agentMap[agentName];
      ag.kills += player.stats?.kills ?? 0;
      ag.deaths += player.stats?.deaths ?? 0;
      ag.damage += player.damage_made ?? 0;
      ag.rounds += rounds;
      ag.matches++;
      if (won) ag.wins++;
    }

    const count = matches.length;
    const totalShots = totalHeadshots + totalBodyshots + totalLegshots;

    const stats = {
      matchesPlayed: count,
      winRate: count > 0 ? Math.round((wins / count) * 100) : 0,
      kd: totalDeaths > 0 ? Math.round((totalKills / totalDeaths) * 100) / 100 : totalKills,
      headshotPct: totalShots > 0 ? Math.round((totalHeadshots / totalShots) * 100) : 0,
      killsPerRound: totalRounds > 0 ? Math.round((totalKills / totalRounds) * 100) / 100 : 0,
      scorePerRound: totalRounds > 0 ? Math.round(totalScore / totalRounds) : 0,
      damagePerRound: totalRounds > 0 ? Math.round(totalDamage / totalRounds) : 0,
    };

    const agents = Object.values(agentMap)
      .sort((a, b) => b.matches - a.matches)
      .map(a => ({
        name: a.name,
        imageUrl: a.imageUrl,
        matchesPlayed: a.matches,
        winRate: Math.round((a.wins / a.matches) * 100),
        kd: a.deaths > 0 ? Math.round((a.kills / a.deaths) * 100) / 100 : a.kills,
        damagePerRound: a.rounds > 0 ? Math.round(a.damage / a.rounds) : 0,
      }));

    const seasons: any[] = [];
    const bySeason = mmrRes?.data?.data?.by_season;
    if (bySeason) {
      for (const [key, val] of Object.entries(bySeason) as [string, any][]) {
        if (!val || (val.number_of_games ?? 0) === 0) continue;
        const m = key.match(/e(\d+)a(\d+)/);
        seasons.push({
          season: key,
          label: m ? `에피소드 ${m[1]} 액트 ${m[2]}` : key,
          rankName: val.final_rank_patched ?? null,
          tier: val.final_rank ?? 0,
          matchesPlayed: val.number_of_games ?? 0,
          wins: val.wins ?? 0,
          winRate: val.number_of_games > 0 ? Math.round(((val.wins ?? 0) / val.number_of_games) * 100) : 0,
        });
      }
      seasons.sort((a, b) => b.season.localeCompare(a.season));
    }

    const rlHeaders = matchesRes.headers;
    const rawReset = Number(rlHeaders["x-ratelimit-reset"] ?? rlHeaders["ratelimit-reset"] ?? 0);
    // Unix timestamp이면 남은 초로 변환, 이미 초 단위면 그대로 사용
    const resetInSecs = rawReset > 1_000_000_000
      ? Math.max(0, Math.ceil((rawReset * 1000 - Date.now()) / 1000))
      : rawReset;
    const rateLimit = {
      limit: Number(rlHeaders["x-ratelimit-limit"] ?? rlHeaders["ratelimit-limit"] ?? 0),
      remaining: Number(rlHeaders["x-ratelimit-remaining"] ?? rlHeaders["ratelimit-remaining"] ?? 0),
      resetInSecs,
    };
    console.log("[tracker] rate limit:", rateLimit, "raw reset:", rawReset);

    return Response.json({ stats, agents, seasons, gameName, tagLine, rateLimit });
  } catch (e: any) {
    const status = e?.response?.status;
    console.error("커리어 통계 오류:", e?.message);
    if (status === 404) return Response.json({ error: "플레이어를 찾을 수 없어요." }, { status: 404 });
    if (status === 429) return Response.json({ error: "요청 한도 초과. 잠시 후 다시 시도해주세요." }, { status: 429 });
    if (status === 401 || status === 403) return Response.json({ error: "API 키가 만료됐어요." }, { status: 503 });
    return Response.json({ error: "데이터를 가져오지 못했어요." }, { status: 500 });
  }
}
