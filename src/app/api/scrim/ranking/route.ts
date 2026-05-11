import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const tierFilter = req.nextUrl.searchParams.get("tier"); // e.g., "초월자", "불멸"

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
        },
      },
    },
  });

  const userTierMap = new Map(users.map(u => [u.id, u]));

  // Function to get tier icon URL based on tier name
  function getTierIconUrl(tierName: string | null): string | null {
    // Map Korean tier names to standard Valorant tier icons
    const tierIcons: { [key: string]: string } = {
      "아이언": "/images/tiers/iron.png",
      "브론즈": "/images/tiers/bronze.png",
      "실버": "/images/tiers/silver.png",
      "골드": "/images/tiers/gold.png",
      "플래티넘": "/images/tiers/platinum.png",
      "다이아몬드": "/images/tiers/diamond.png",
      "초월자": "/images/tiers/ascendant.png",
      "불멸": "/images/tiers/immortal.png",
      "레디언트": "/images/tiers/radiant.png",
      "언랭크": "/images/tiers/unranked.png",
    };
    
    // Check if it contains the tier name
    for (const [key, url] of Object.entries(tierIcons)) {
      if (tierName.includes(key)) return url;
    }
    
    return "/images/tiers/unranked.png";
  }

  // 4. 랭킹 데이터 구성 및 필터링
  let ranking = Array.from(statsMap.values()).map(s => {
    const user = userTierMap.get(s.userId);
    const tierName = user?.riotAccounts?.[0]?.cachedTierName || "언랭크";
    const tierIconUrl = getTierIconUrl(tierName);
    
    return {
      ...s,
      name: user?.name || "Unknown", // Discord nickname
      image: user?.image || null,
      tier: tierName,
      tierIconUrl,
      kd: s.deaths === 0 ? s.kills : Number((s.kills / s.deaths).toFixed(2)),
    };
  });

  // 티어 필터 적용
  if (tierFilter) {
    ranking = ranking.filter(r => r.tier.includes(tierFilter));
  }

  // KD 순으로 정렬
  ranking.sort((a, b) => b.kd - a.kd || b.kills - a.kills);

  // 순위 부여
  const finalRanking = ranking.map((r, index) => ({
    ...r,
    rank: index + 1,
  }));

  // 5. 개인 순위 찾기 (타입 안정성 확보)
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
