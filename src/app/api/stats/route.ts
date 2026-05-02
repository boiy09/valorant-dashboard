import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentMatches } from "@/lib/valorant";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "agents"; // agents | form | server

  if (type === "server") {
    // 서버 전체 통계: 모든 연동된 유저의 최근 매치 aggregate
    const users = await prisma.user.findMany({ where: { riotPuuid: { not: null } }, take: 50 });
    let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalMatches = 0;
    const agentMap: Record<string, { games: number; wins: number }> = {};
    for (const user of users) {
      try {
        const matches = await getRecentMatches(user.riotPuuid!, 5);
        for (const m of matches) {
          totalKills += m.kills; totalDeaths += m.deaths; totalAssists += m.assists; totalMatches++;
          if (!agentMap[m.agent]) agentMap[m.agent] = { games: 0, wins: 0 };
          agentMap[m.agent].games++;
          if (m.result === "승리") agentMap[m.agent].wins++;
        }
      } catch {}
    }
    const topAgents = Object.entries(agentMap)
      .map(([agent, d]) => ({ agent, games: d.games, winRate: d.games > 0 ? Math.round(d.wins / d.games * 100) : 0 }))
      .sort((a, b) => b.games - a.games).slice(0, 10);
    return Response.json({
      totalMatches, totalUsers: users.length,
      avgKills: totalMatches > 0 ? (totalKills / totalMatches).toFixed(1) : "0",
      avgDeaths: totalMatches > 0 ? (totalDeaths / totalMatches).toFixed(1) : "0",
      topAgents,
    });
  }

  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user?.riotPuuid) return Response.json({ error: "라이엇 계정을 연동해주세요." }, { status: 400 });

  let matches;
  try {
    matches = await getRecentMatches(user.riotPuuid, 20);
  } catch (e: any) {
    const status = e?.response?.status;
    console.error("stats getRecentMatches 오류:", status, e?.message);
    if (status === 401 || status === 403) return Response.json({ error: "Henrik Dev API 키가 만료됐어요. .env.local을 확인해주세요." }, { status: 503 });
    if (status === 429) return Response.json({ error: "API 요청 한도 초과." }, { status: 429 });
    return Response.json({ error: "매치 데이터를 가져오지 못했어요." }, { status: 500 });
  }

  if (type === "agents") {
    const agentMap: Record<string, { games: number; wins: number; kills: number; deaths: number; assists: number }> = {};
    for (const m of matches) {
      if (!agentMap[m.agent]) agentMap[m.agent] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      const a = agentMap[m.agent];
      a.games++; a.kills += m.kills; a.deaths += m.deaths; a.assists += m.assists;
      if (m.result === "승리") a.wins++;
    }
    const agents = Object.entries(agentMap).map(([agent, d]) => ({
      agent,
      games: d.games,
      winRate: Math.round(d.wins / d.games * 100),
      avgKills: (d.kills / d.games).toFixed(1),
      avgDeaths: (d.deaths / d.games).toFixed(1),
      avgAssists: (d.assists / d.games).toFixed(1),
      kd: d.deaths > 0 ? (d.kills / d.deaths).toFixed(2) : d.kills.toFixed(2),
    })).sort((a, b) => b.games - a.games);
    return Response.json({ agents });
  }

  if (type === "form") {
    // 최근 20경기 5경기 단위 폼 분석
    const chunks = [];
    for (let i = 0; i < matches.length; i += 5) {
      const chunk = matches.slice(i, i + 5);
      if (chunk.length === 0) break;
      const wins = chunk.filter(m => m.result === "승리").length;
      const avgKills = (chunk.reduce((s, m) => s + m.kills, 0) / chunk.length).toFixed(1);
      chunks.push({ label: `최근 ${i + chunk.length}경기`, wins, games: chunk.length, avgKills });
    }
    return Response.json({ form: chunks, matches: matches.slice(0, 10).map(m => ({ result: m.result, kills: m.kills, deaths: m.deaths, assists: m.assists, agent: m.agent, map: m.map })) });
  }

  return Response.json({ error: "unknown type" }, { status: 400 });
}
