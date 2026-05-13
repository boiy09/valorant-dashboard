import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin";

type ScrimGameRow = {
  kdaSnapshot: string | null;
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

  // 1. 모든 내전 경기 데이터 가져오기
  const games = await prisma.$queryRaw<ScrimGameRow[]>`
    SELECT "kdaSnapshot" FROM "ScrimGame"
  `;

  const statsMap = new Map<string, {
    userId: string;
    kills: number;
    deaths: number;
    assists: number;
    gamesPlayed: number;
  }>();

  // 2. KDA 데이터 합산
  for (const game of games) {
    try {
      const kdaList = game.kdaSnapshot ? JSON.parse(game.kdaSnapshot) : [];
      
      for (const p of kdaList) {
        const uid = p.userId;
        const existing = statsMap.get(uid) || {
          userId: uid,
          kills: 0,
          deaths: 0,
          assists: 0,
          gamesPlayed: 0,
        };
        existing.kills += Number(p.kills || 0);
        existing.deaths += Number(p.deaths || 0);
        existing.assists += Number(p.assists || 0);
        existing.gamesPlayed += 1;
        statsMap.set(uid, existing);
      }
    } catch (e) {
      console.error("Failed to parse kdaSnapshot", e);
    }
  }

  // 3. 사용자 정보 및 티어 정보 가져오기
  const userIds = Array.from(statsMap.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      image: true,
      riotAccounts: {
        select: {
          cachedTierName: true,
          region: true,
        },
      },
    },
  });

  const userTierMap = new Map((users as RankingUserRow[]).map(u => [u.id, u]));
  const guildMembers = guild
    ? await prisma.guildMember.findMany({
        where: { guildId: guild.id, userId: { in: userIds } },
        select: { userId: true, nickname: true },
      })
    : [];
  const serverNickMap = new Map(guildMembers.map((member) => [member.userId, member.nickname]));

  // 최신 발로란트 티어 아이콘 URL 매핑 (ID: 03621f52-342b-cf4e-4f86-9350a49c6d04)
  function getTierIconUrl(tierName: string | null): string {
    if (!tierName || tierName === "언랭크" || tierName === "랭크 없음") {
        return "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png";
    }
    
    const tierIcons: { [key: string]: string } = {
      "아이언 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/3/largeicon.png",
      "아이언 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/4/largeicon.png",
      "아이언 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/5/largeicon.png",
      "브론즈 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/6/largeicon.png",
      "브론즈 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/7/largeicon.png",
      "브론즈 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/8/largeicon.png",
      "실버 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/9/largeicon.png",
      "실버 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/10/largeicon.png",
      "실버 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/11/largeicon.png",
      "골드 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/12/largeicon.png",
      "골드 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/13/largeicon.png",
      "골드 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/14/largeicon.png",
      "플래티넘 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/15/largeicon.png",
      "플래티넘 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/16/largeicon.png",
      "플래티넘 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/17/largeicon.png",
      "다이아몬드 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/18/largeicon.png",
      "다이아몬드 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/19/largeicon.png",
      "다이아몬드 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/20/largeicon.png",
      "초월자 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/21/largeicon.png",
      "초월자 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/22/largeicon.png",
      "초월자 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/23/largeicon.png",
      "불멸 1": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/24/largeicon.png",
      "불멸 2": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/25/largeicon.png",
      "불멸 3": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/26/largeicon.png",
      "레디언트": "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/27/largeicon.png",
    };

    // 부분 일치 검색 (예: "초월자 1" -> "초월자 1" 아이콘)
    for (const [key, url] of Object.entries(tierIcons)) {
      if (tierName === key || tierName.includes(key)) return url;
    }
    
    // 키워드 기반 매핑 (예: "초월자" -> "초월자 1" 아이콘)
    const keywords: { [key: string]: string } = {
        "아이언": "3", "브론즈": "6", "실버": "9", "골드": "12", "플래티넘": "15",
        "다이아몬드": "18", "초월자": "21", "불멸": "24", "레디언트": "27"
    };
    for (const [key, id] of Object.entries(keywords)) {
        if (tierName.includes(key)) return `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${id}/largeicon.png`;
    }

    return "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png";
  }

  // 4. 랭킹 데이터 구성
  let ranking = Array.from(statsMap.values()).map(s => {
    const user = userTierMap.get(s.userId);
    
    const krAccount = user?.riotAccounts?.find(a => a.region === "KR");
    const apAccount = user?.riotAccounts?.find(a => a.region !== "KR");

    const krTier = krAccount?.cachedTierName || "언랭크";
    const apTier = apAccount?.cachedTierName || "언랭크";

    return {
      ...s,
      name: serverNickMap.get(s.userId) || user?.name || "Unknown",
      image: user?.image || null,
      krTier,
      krTierIcon: getTierIconUrl(krTier),
      apTier,
      apTierIcon: getTierIconUrl(apTier),
      matches: s.gamesPlayed,
      gamesPlayed: s.gamesPlayed,
      kd: s.deaths === 0 ? s.kills : Number((s.kills / s.deaths).toFixed(2)),
    };
  });

  if (tierFilter) {
    ranking = ranking.filter(r => r.krTier.includes(tierFilter) || r.apTier.includes(tierFilter));
  }

  ranking.sort((a, b) => b.kd - a.kd || b.kills - a.kills);

  const finalRanking = ranking.map((r, index) => ({
    ...r,
    rank: index + 1,
  }));

  let myRank: unknown = null;
  const myUserId = session?.user?.id;
  if (myUserId) {
    const myIndex = finalRanking.findIndex(r => r.userId === myUserId);
    if (myIndex !== -1) {
      myRank = finalRanking[myIndex];
    }
  }

  return Response.json({
    ranking: finalRanking,
    myRank,
  });
}
