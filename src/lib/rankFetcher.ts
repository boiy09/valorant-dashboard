/**
 * 랭크/프로필 우선순위 체인
 * 1. Riot Private API (토큰 있으면 — rate limit 없음)
 * 2. tracker.gg (API 키 있으면 — Henrik보다 관대)
 * 3. Henrik API (최후 수단)
 */

import { prisma } from "@/lib/prisma";
import { refreshTokens } from "@/lib/riotAuth";
import { getPrivateMMR, getPrivateProfile } from "@/lib/riotPrivateApi";
import { getTrackerCurrentRank } from "@/lib/trackergg";
import { getRankByPuuid, getRankIconByTier, getPlayerByRiotId, type ValorantRegion } from "@/lib/valorant";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 만료 5분 전부터 갱신

export interface AccountTokens {
  accessToken: string;
  entitlementsToken: string;
}

export interface FetchedRank {
  tierId: number;
  tierName: string;
  rankIcon: string | null;
}

export interface FetchedProfile {
  level: number | null;
  card: string | null;
}

// DB에서 유효한 토큰을 가져오거나 ssid로 갱신
export async function ensureValidTokens(
  puuid: string,
  accessToken: string | null,
  entitlementsToken: string | null,
  ssid: string | null,
  tokenExpiresAt: Date | null
): Promise<AccountTokens | null> {
  const now = Date.now();
  const isValid =
    accessToken &&
    entitlementsToken &&
    tokenExpiresAt &&
    tokenExpiresAt.getTime() - now > TOKEN_EXPIRY_BUFFER_MS;

  if (isValid) {
    return { accessToken: accessToken!, entitlementsToken: entitlementsToken! };
  }

  // 토큰 만료 — ssid로 갱신 시도
  if (!ssid) return null;

  try {
    const result = await refreshTokens(ssid);
    if (result.status !== "success") return null;

    // 새 entitlementsToken 발급
    const entRes = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${result.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!entRes.ok) return null;

    const entData = await entRes.json() as { entitlements_token: string };
    const newAccess = result.accessToken;
    const newEnt = entData.entitlements_token;
    const expiresAt = new Date(now + 55 * 60 * 1000); // 55분 후 만료 처리

    // DB 비동기 업데이트
    prisma.riotAccount.update({
      where: { puuid },
      data: { accessToken: newAccess, entitlementsToken: newEnt, tokenExpiresAt: expiresAt },
    }).catch(() => {});

    return { accessToken: newAccess, entitlementsToken: newEnt };
  } catch {
    return null;
  }
}

// 랭크 조회: Private API → tracker.gg → Henrik
export async function fetchRank(
  puuid: string,
  region: string,
  gameName: string,
  tagLine: string,
  tokens: AccountTokens | null
): Promise<FetchedRank> {
  const regionLower = region.toLowerCase() as ValorantRegion;

  // 1. Riot Private API
  if (tokens) {
    const mmr = await getPrivateMMR(puuid, region, tokens.accessToken, tokens.entitlementsToken).catch(() => null);
    if (mmr && mmr.currentTierId > 0) {
      const rankIcon = await getRankIconByTier(mmr.currentTierId).catch(() => null);
      // tierName은 valorant-api.com에서 가져와야 하므로 Henrik getRankByPuuid 없이 tierId만 활용
      // 티어명은 DB tierId → tierName 매핑으로 처리 (아래 공통 함수 사용)
      return {
        tierId: mmr.currentTierId,
        tierName: tierIdToName(mmr.currentTierId),
        rankIcon,
      };
    }
  }

  // 2. tracker.gg
  const tgg = await getTrackerCurrentRank(gameName, tagLine).catch(() => null);
  if (tgg && tgg.tierId > 0) {
    const rankIcon = tgg.rankIcon ?? await getRankIconByTier(tgg.tierId).catch(() => null);
    return { tierId: tgg.tierId, tierName: tgg.tierName, rankIcon };
  }

  // 3. Henrik (최후 수단)
  const henrik = await getRankByPuuid(puuid, regionLower, { gameName, tagLine }).catch(() => null);
  if (henrik && henrik.tierId > 0) {
    return {
      tierId: henrik.tierId,
      tierName: henrik.tierName,
      rankIcon: henrik.rankIcon ?? null,
    };
  }

  return { tierId: 0, tierName: "언랭크", rankIcon: null };
}

// 프로필(레벨+카드) 조회: Private API → Henrik
export async function fetchProfile(
  puuid: string,
  region: string,
  gameName: string,
  tagLine: string,
  tokens: AccountTokens | null
): Promise<FetchedProfile> {
  // 1. Riot Private API
  if (tokens) {
    const profile = await getPrivateProfile(puuid, region, tokens.accessToken, tokens.entitlementsToken).catch(() => null);
    if (profile) {
      const cardUrl = profile.cardId
        ? `https://media.valorant-api.com/playercards/${profile.cardId}/smallart.png`
        : null;
      return { level: profile.level || null, card: cardUrl };
    }
  }

  // 2. Henrik
  const henrik = await getPlayerByRiotId(gameName, tagLine).catch(() => null);
  return {
    level: henrik?.accountLevel != null && henrik.accountLevel >= 0 ? henrik.accountLevel : null,
    card: henrik?.card ?? null,
  };
}

// tierId → 한국어 tierName 매핑 (Henrik 없이 사용)
function tierIdToName(tierId: number): string {
  const map: Record<number, string> = {
    0: "언랭크",
    3: "아이언 1", 4: "아이언 2", 5: "아이언 3",
    6: "브론즈 1", 7: "브론즈 2", 8: "브론즈 3",
    9: "실버 1", 10: "실버 2", 11: "실버 3",
    12: "골드 1", 13: "골드 2", 14: "골드 3",
    15: "플래티넘 1", 16: "플래티넘 2", 17: "플래티넘 3",
    18: "다이아몬드 1", 19: "다이아몬드 2", 20: "다이아몬드 3",
    21: "초월자 1", 22: "초월자 2", 23: "초월자 3",
    24: "불멸 1", 25: "불멸 2", 26: "불멸 3",
    27: "레디언트",
  };
  return map[tierId] ?? "언랭크";
}
