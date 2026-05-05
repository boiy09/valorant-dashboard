import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentMatches } from "@/lib/valorant";

export const dynamic = "force-dynamic";

type RiotRegion = "KR" | "AP";

function normalizeRegion(value: string | null): RiotRegion {
  return value?.toUpperCase() === "AP" ? "AP" : "KR";
}

function toQueryRegion(region: RiotRegion): "kr" | "ap" {
  return region === "AP" ? "ap" : "kr";
}

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: { riotAccounts: true },
  });

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      include: { riotAccounts: true },
    });
  }

  return user;
}

function getAccountByRegion(
  user: Awaited<ReturnType<typeof findUser>>,
  region: RiotRegion
) {
  if (!user) return null;

  return (
    user.riotAccounts.find((account) => account.region === region) ??
    (region === "KR" && user.riotPuuid
      ? {
          puuid: user.riotPuuid,
          gameName: user.riotGameName ?? "",
          tagLine: user.riotTagLine ?? "",
          region: "KR" as const,
        }
      : null)
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const region = normalizeRegion(searchParams.get("region"));

    if (!type) {
      return NextResponse.json({ error: "통계 타입이 필요합니다." }, { status: 400 });
    }

    const user = await findUser(session.user.id, session.user.email);
    if (!user) {
      return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    if (type === "server") {
      const users = await prisma.user.findMany({
        include: { riotAccounts: true },
        take: 50,
      });

      const activeUsers = users.filter((member) => {
        return (
          member.riotAccounts.length > 0 ||
          Boolean(member.riotPuuid && member.riotGameName && member.riotTagLine)
        );
      });

      let totalWins = 0;
      let totalLosses = 0;
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
      let playerCount = 0;
      const agentMap = new Map<string, number>();

      for (const member of activeUsers) {
        const account =
          member.riotAccounts.find((item) => item.region === region) ??
          member.riotAccounts[0] ??
          (member.riotPuuid
            ? {
                puuid: member.riotPuuid,
                gameName: member.riotGameName ?? "",
                tagLine: member.riotTagLine ?? "",
                region: "KR" as const,
              }
            : null);

        if (!account) continue;

        try {
          const matches = await getRecentMatches(account.puuid, 10, toQueryRegion(account.region as RiotRegion));
          if (!matches.length) continue;

          const wins = matches.filter((match) => match.result === "승리").length;
          const losses = matches.filter((match) => match.result === "패배").length;

          totalWins += wins;
          totalLosses += losses;
          totalKills += matches.reduce((sum, match) => sum + match.kills, 0);
          totalDeaths += matches.reduce((sum, match) => sum + match.deaths, 0);
          totalAssists += matches.reduce((sum, match) => sum + match.assists, 0);
          playerCount += 1;

          for (const match of matches) {
            agentMap.set(match.agent, (agentMap.get(match.agent) ?? 0) + 1);
          }
        } catch {
          continue;
        }
      }

      return NextResponse.json({
        totalPlayers: playerCount,
        totalMatches: totalWins + totalLosses,
        serverWinRate:
          totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0,
        avgKDA:
          totalDeaths > 0
            ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
            : "0.00",
        topRanks: Array.from(agentMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count })),
        region,
      });
    }

    const account = getAccountByRegion(user, region);
    if (!account) {
      return NextResponse.json(
        {
          gamesPlayed: 0,
          data: [],
          region,
          message: `${region} 계정이 아직 연결되어 있지 않습니다.`,
        },
        { status: 200 }
      );
    }

    const matches = await getRecentMatches(account.puuid, 20, toQueryRegion(account.region as RiotRegion));

    if (type === "agents") {
      const agentStats = new Map<
        string,
        { kills: number; deaths: number; assists: number; wins: number; games: number }
      >();

      for (const match of matches) {
        const current = agentStats.get(match.agent) ?? {
          kills: 0,
          deaths: 0,
          assists: 0,
          wins: 0,
          games: 0,
        };

        current.kills += match.kills;
        current.deaths += match.deaths;
        current.assists += match.assists;
        current.games += 1;
        if (match.result === "승리") current.wins += 1;

        agentStats.set(match.agent, current);
      }

      const data = Array.from(agentStats.entries()).map(([agent, stats]) => ({
        agent,
        games: stats.games,
        winRate: Math.round((stats.wins / stats.games) * 100),
        avgKills: Number((stats.kills / stats.games).toFixed(1)),
        avgDeaths: Number((stats.deaths / stats.games).toFixed(1)),
        avgAssists: Number((stats.assists / stats.games).toFixed(1)),
        avgKDA: Number(
          ((stats.kills + stats.assists) / Math.max(stats.deaths, 1)).toFixed(2)
        ),
      }));

      return NextResponse.json({ data, region });
    }

    if (type === "form") {
      const recentMatches = matches.slice(0, 10);
      const data = recentMatches.map((match, index) => ({
        game: `게임 ${index + 1}`,
        result: match.result,
        score: `${match.kills}/${match.deaths}/${match.assists}`,
        kda: Number(((match.kills + match.assists) / Math.max(match.deaths, 1)).toFixed(2)),
      }));

      return NextResponse.json({
        data,
        recentWinRate:
          recentMatches.length > 0
            ? Math.round(
                (recentMatches.filter((match) => match.result === "승리").length /
                  recentMatches.length) *
                  100
              )
            : 0,
        region,
      });
    }

    return NextResponse.json({ error: "지원하지 않는 통계 타입입니다." }, { status: 400 });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json({ error: "통계 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
