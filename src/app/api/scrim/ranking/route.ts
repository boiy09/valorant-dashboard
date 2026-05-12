import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const tierFilter = req.nextUrl.searchParams.get("tier");

  // 1. 모든 내전 경기 데이터 가져오기
  const games = await prisma.scrimGame.findMany({
    select: {
      kdaSnapshot: true,
    },
  });

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
      const kdaList = typeof game.kdaSnapshot === "string" 
        ? JSON.parse(game.kdaSnapshot) 
        : game.kdaSnapshot;
      
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

  const userTierMap = new Map(users.map(u => [u.id, u]));

  // 티어 아이콘 URL 매핑 함수
  function getTierIconUrl(tierName: string | null): string {
    if (!tierName || tierName === "언랭크") return "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/0/largeicon.png";
    
    const tierIcons: { [key: string]: string } = {
      "아이언": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/3/largeicon.png",
      "브론즈": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/6/largeicon.png",
      "실버": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/9/largeicon.png",
      "골드": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/12/largeicon.png",
      "플래티넘": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/15/largeicon.png",
      "다이아몬드": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/18/largeicon.png",
      "초월자": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/21/largeicon.png",
      "불멸": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/24/largeicon.png",
      "레디언트": "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/27/largeicon.png",
    };

    for (const [key, url] of Object.entries(tierIcons)) {
      if (tierName.includes(key)) return url;
    }
    return "https://media.valorant-api.com/competitivetiers/03621f52-342b-444e-9881-62113c9677f3/0/largeicon.png";
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
      name: user?.name || "Unknown",
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

  let myRank = null;
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
