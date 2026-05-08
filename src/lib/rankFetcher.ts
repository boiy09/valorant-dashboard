/**
 * 랭크/프로필 우선순위 체인
 * 1. Riot Private API (토큰 있으면 — rate limit 없음)
 * 2. tracker.gg (API 키 있으면 — Henrik보다 관대)
 * 3. Henrik API (최후 수단)
 */

import { prisma } from "@/lib/prisma";
import { refreshTokens } from "@/lib/riotAuth";
import { getPrivateMMR, getPrivateProfile } from "@/lib/riotPrivateApi";
import { normalizeTierName, tierIdToKorean } from "@/lib/tierName";
import { getTrackerCurrentRank } from "@/lib/trackergg";
import { getRankByPuuid, getRankIconByTier, getPlayerByRiotId, type ValorantRegion } from "@/lib/valorant";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// 타임아웃 래퍼 — ms 내 응답 없으면 null 반환
function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

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

// 유효한 토큰 확인 or ssid로 갱신 (최대 6초)
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

  if (!ssid) return null;

  try {
    const result = await withTimeout(
      refreshTokens(ssid).catch(() => null),
      6000
    );
    if (!result || result.status !== "success") return null;

    const entRes = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${result.accessToken}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!entRes?.ok) return null;

    const entData = await entRes.json() as { entitlements_token: string };
    const newAccess = result.accessToken;
    const newEnt = entData.entitlements_token;

    prisma.riotAccount.update({
      where: { puuid },
      data: {
        accessToken: newAccess,
        entitlementsToken: newEnt,
        tokenExpiresAt: new Date(now + 55 * 60 * 1000),
      },
    }).catch(() => {});

    return { accessToken: newAccess, entitlementsToken: newEnt };
  } catch {
    return null;
  }
}

// 랭크 조회: Private API(5s) → tracker.gg(6s) → Henrik(10s)
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
    const mmr = await withTimeout(
      getPrivateMMR(puuid, region, tokens.accessToken, tokens.entitlementsToken).catch(() => null),
      5000
    );
    if (mmr && mmr.currentTierId > 0) {
      const rankIcon = await getRankIconByTier(mmr.currentTierId).catch(() => null);
      return { tierId: mmr.currentTierId, tierName: tierIdToKorean(mmr.currentTierId), rankIcon };
    }
  }

  // 2. tracker.gg
  const tgg = await withTimeout(
    getTrackerCurrentRank(gameName, tagLine).catch(() => null),
    6000
  );
  if (tgg && tgg.tierId > 0) {
    const rankIcon = tgg.rankIcon ?? await getRankIconByTier(tgg.tierId).catch(() => null);
    return { tierId: tgg.tierId, tierName: normalizeTierName(tgg.tierName, tgg.tierId), rankIcon };
  }

  // 3. Henrik (최후 수단)
  const henrik = await withTimeout(
    getRankByPuuid(puuid, regionLower, { gameName, tagLine }).catch(() => null),
    10000
  );
  if (henrik && henrik.tierId > 0) {
    return { tierId: henrik.tierId, tierName: normalizeTierName(henrik.tierName, henrik.tierId), rankIcon: henrik.rankIcon ?? null };
  }

  return { tierId: 0, tierName: "언랭크", rankIcon: null };
}

// 프로필(레벨+카드) 조회: Private API(5s) → Henrik(10s)
export async function fetchProfile(
  puuid: string,
  region: string,
  gameName: string,
  tagLine: string,
  tokens: AccountTokens | null
): Promise<FetchedProfile> {
  // 1. Riot Private API
  if (tokens) {
    const profile = await withTimeout(
      getPrivateProfile(puuid, region, tokens.accessToken, tokens.entitlementsToken).catch(() => null),
      5000
    );
    if (profile) {
      const cardUrl = profile.cardId
        ? `https://media.valorant-api.com/playercards/${profile.cardId}/smallart.png`
        : null;
      return { level: profile.level || null, card: cardUrl };
    }
  }

  // 2. Henrik
  const henrik = await withTimeout(
    getPlayerByRiotId(gameName, tagLine).catch(() => null),
    10000
  );
  return {
    level: henrik?.accountLevel != null && henrik.accountLevel >= 0 ? henrik.accountLevel : null,
    card: henrik?.card ?? null,
  };
}

