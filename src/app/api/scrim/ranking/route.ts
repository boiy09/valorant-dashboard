import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin";

type ScrimGameRow = {
  kdaSnapshot: string | null;
  teamSnapshot: string | null;
  winnerId: string | null;
};

type RankingUserRow = {
  id: string;
  name: string | null;
  image: string | null;
  riotAccounts: Array<{
    cachedTierName: string | null;
    region: string;
  }>;
};

export async function GET(req: NextRequest) {
  const { session, guild } = await getAdminSession();
  const tierFilter = req.nextUrl.searchParams.get("tier");

  const games = await prisma.$queryRaw<ScrimGameRow[]>`
    SELECT "kdaSnapshot", "teamSnapshot", "winnerId" FROM "ScrimGame"
  `;

  const statsMap = new Map<string, {
    userId: string;
    kills: number;
    deaths: number;
    assists: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
  }>();

  for (const game of games) {
    try {
      const kdaList: Array<{ userId: string; kills?: number; deaths?: number; assists?: number }> =
        game.kdaSnapshot ? JSON.parse(game.kdaSnapshot) : [];
      const teamSnapshot: { team_a?: string[]; team_b?: string[] } =
        game.teamSnapshot ? JSON.parse(game.teamSnapshot) : {};
      const teamA = teamSnapshot.team_a ?? [];
      const teamB = teamSnapshot.team_b ?? [];

      for (const p of kdaList) {
        const uid = p.userId;
        const existing = statsMap.get(uid) ?? {
          userId: uid, kills: 0, deaths: 0, assists: 0, gamesPlayed: 0, wins: 0, losses: 0,
        };
        existing.kills += Number(p.kills || 0);
        existing.deaths += Number(p.deaths || 0);
        existing.assists += Number(p.assists || 0);
        existing.gamesPlayed += 1;

        if (game.winnerId && game.winnerId !== "draw") {
          const onTeamA = teamA.includes(uid);
          const onTeamB = teamB.includes(uid);
          if (
            (game.winnerId === "team_a" && onTeamA) ||
            (game.winnerId === "team_b" && onTeamB)
          ) {
            existing.wins += 1;
          } else if (
            (game.winnerId === "team_a" && onTeamB) ||
            (game.winnerId === "team_b" && onTeamA)
          ) {
            existing.losses += 1;
          }
        }

        statsMap.set(uid, existing);
      }
    } catch (e) {
      console.error("Failed to parse game data", e);
    }
  }

  const userIds = Array.from(statsMap.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      image: true,
      riotAccounts: { select: { cachedTierName: true, region: true } },
    },
  });

  const userTierMap = new Map((users as RankingUserRow[]).map((u) => [u.id, u]));
  const guildMembers = guild
    ? await prisma.guildMember.findMany({
        where: { guildId: guild.id, userId: { in: userIds } },
        select: { userId: true, nickname: true },
      })
    : [];
  const serverNickMap = new Map(guildMembers.map((m) => [m.userId, m.nickname]));

  function getTierIconUrl(tierName: string | null): string {
    const BASE = "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04";
    if (!tierName || tierName === "언랭크" || tierName === "랭크 없음")
      return `${BASE}/0/largeicon.png`;

    const exact: Record<string, string> = {
      "아이언 1": "3", "아이언 2": "4", "아이언 3": "5",
      "브론즈 1": "6", "브론즈 2": "7", "브론즈 3": "8",
      "실버 1": "9", "실버 2": "10", "실버 3": "11",
      "골드 1": "12", "골드 2": "13", "골드 3": "14",
      "플래티넘 1": "15", "플래티넘 2": "16", "플래티넘 3": "17",
      "다이아몬드 1": "18", "다이아몬드 2": "19", "다이아몬드 3": "20",
      "초월자 1": "21", "초월자 2": "22", "초월자 3": "23",
      "불멸 1": "24", "불멸 2": "25", "불멸 3": "26",
      "레디언트": "27",
    };
    for (const [key, id] of Object.entries(exact)) {
      if (tierName === key || tierName.includes(key)) return `${BASE}/${id}/largeicon.png`;
    }
    const keywords: Record<string, string> = {
      "아이언": "3", "브론즈": "6", "실버": "9", "골드": "12",
      "플래티넘": "15", "다이아몬드": "18", "초월자": "21", "불멸": "24", "레디언트": "27",
    };
    for (const [key, id] of Object.entries(keywords)) {
      if (tierName.includes(key)) return `${BASE}/${id}/largeicon.png`;
    }
    return `${BASE}/0/largeicon.png`;
  }

  let ranking = Array.from(statsMap.values()).map((s) => {
    const user = userTierMap.get(s.userId);
    const krTier = user?.riotAccounts?.find((a) => a.region === "KR")?.cachedTierName ?? "언랭크";
    const apTier = user?.riotAccounts?.find((a) => a.region !== "KR")?.cachedTierName ?? "언랭크";
    const winRate = s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) : 0;

    return {
      ...s,
      name: serverNickMap.get(s.userId) ?? user?.name ?? "Unknown",
      image: user?.image ?? null,
      krTier,
      krTierIcon: getTierIconUrl(krTier),
      apTier,
      apTierIcon: getTierIconUrl(apTier),
      matches: s.gamesPlayed,
      winRate,
      kd: s.deaths === 0 ? s.kills : Number((s.kills / s.deaths).toFixed(2)),
    };
  });

  if (tierFilter) {
    ranking = ranking.filter((r) => r.krTier.includes(tierFilter) || r.apTier.includes(tierFilter));
  }

  ranking.sort((a, b) => b.kd - a.kd || b.kills - a.kills);

  const finalRanking = ranking.map((r, i) => ({ ...r, rank: i + 1 }));

  let myRank: unknown = null;
  const myUserId = session?.user?.id;
  if (myUserId) {
    const idx = finalRanking.findIndex((r) => r.userId === myUserId);
    if (idx !== -1) myRank = finalRanking[idx];
  }

  return Response.json({ ranking: finalRanking, myRank });
}
