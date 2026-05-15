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
import { getOpGgProfileFallback } from "@/lib/opgg";

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

export type TokenRelinkReason = "missing" | "refresh_failed" | null;

export interface TokenState {
  tokens: AccountTokens | null;
  needsRelink: boolean;
  reason: TokenRelinkReason;
  message: string | null;
}

function extractSsid(cookies: string) {
  return cookies.match(/(?:^|;\s*)(ssid=[^;]+)/)?.[1] ?? null;
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
export async function ensureTokenState(
  puuid: string,
  accessToken: string | null,
  entitlementsToken: string | null,
  ssid: string | null,
  authCookie: string | null,
  tokenExpiresAt: Date | null
): Promise<TokenState> {
  const now = Date.now();
  const isValid =
    accessToken &&
    entitlementsToken &&
    tokenExpiresAt &&
    tokenExpiresAt.getTime() - now > TOKEN_EXPIRY_BUFFER_MS;

  if (isValid) {
    return {
      tokens: { accessToken: accessToken!, entitlementsToken: entitlementsToken! },
      needsRelink: false,
      reason: null,
      message: null,
    };
  }

  const refreshCookie = authCookie || ssid;
  if (!refreshCookie) {
    return {
      tokens: null,
      needsRelink: true,
      reason: "missing",
      message: "Riot 인증 정보가 없어 다시 연동이 필요합니다.",
    };
  }

  try {
    const result = await withTimeout(
      refreshTokens(refreshCookie).catch(() => null),
      6000
    );
    if (!result || result.status !== "success") {
      return {
        tokens: null,
        needsRelink: true,
        reason: "refresh_failed",
        message: "Riot 로그인 세션이 만료되어 다시 연동이 필요합니다.",
      };
    }

    const entRes = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${result.accessToken}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!entRes?.ok) {
      return {
        tokens: null,
        needsRelink: true,
        reason: "refresh_failed",
        message: "Riot 권한 토큰을 갱신하지 못했습니다. 다시 연동해 주세요.",
      };
    }

    const entData = await entRes.json() as { entitlements_token: string };
    const newAccess = result.accessToken;
    const newEnt = entData.entitlements_token;

    prisma.riotAccount.update({
      where: { puuid },
      data: {
        accessToken: newAccess,
        entitlementsToken: newEnt,
        tokenExpiresAt: new Date(now + 55 * 60 * 1000),
        authCookie: result.cookies || refreshCookie,
        ssid: extractSsid(result.cookies || refreshCookie) ?? ssid,
      },
    }).catch((e) => console.error("[rankFetcher] token cache update failed:", puuid, e));

    return {
      tokens: { accessToken: newAccess, entitlementsToken: newEnt },
      needsRelink: false,
      reason: null,
      message: null,
    };
  } catch {
    return {
      tokens: null,
      needsRelink: true,
      reason: "refresh_failed",
      message: "Riot 토큰 갱신 중 오류가 발생했습니다. 다시 연동해 주세요.",
    };
  }
}

export async function ensureValidTokens(
  puuid: string,
  accessToken: string | null,
  entitlementsToken: string | null,
  ssid: string | null,
  authCookie: string | null,
  tokenExpiresAt: Date | null
): Promise<AccountTokens | null> {
  return (await ensureTokenState(puuid, accessToken, entitlementsToken, ssid, authCookie, tokenExpiresAt)).tokens;
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
      return { tierId: mmr.currentTierId, tierName: tierIdToName(mmr.currentTierId), rankIcon };
    }
  }

  // 2. tracker.gg
  const tgg = await withTimeout(
    getTrackerCurrentRank(gameName, tagLine).catch(() => null),
    6000
  );
  if (tgg && tgg.tierId > 0) {
    const rankIcon = tgg.rankIcon ?? await getRankIconByTier(tgg.tierId).catch(() => null);
    return { tierId: tgg.tierId, tierName: tgg.tierName, rankIcon };
  }

  // 3. Henrik (최후 수단)
  const henrik = await withTimeout(
    getRankByPuuid(puuid, regionLower, { gameName, tagLine }).catch(() => null),
    10000
  );
  if (henrik && henrik.tierId > 0) {
    return { tierId: henrik.tierId, tierName: henrik.tierName, rankIcon: henrik.rankIcon ?? null };
  }

  return { tierId: 0, tierName: "언랭크", rankIcon: null };
}

// 프로필(레벨+카드) 조회: Private API(5s) → Henrik+op.gg(10s) → op.gg 단독(5s)
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

  // 2. Henrik (내부적으로 op.gg 카드/레벨 포함)
  const henrik = await withTimeout(
    getPlayerByRiotId(gameName, tagLine).catch(() => null),
    10000
  );
  const henrikLevel = henrik?.accountLevel != null && henrik.accountLevel >= 0 ? henrik.accountLevel : null;
  const henrikCard = henrik?.card ?? null;
  if (henrikLevel !== null || henrikCard !== null) {
    return { level: henrikLevel, card: henrikCard };
  }

  // 3. op.gg 직접 스크래핑 (Henrik 완전 실패 시 최종 보험)
  const opgg = await withTimeout(
    getOpGgProfileFallback(gameName, tagLine).catch(() => null),
    5000
  );
  return {
    level: opgg?.level ?? null,
    card: opgg?.playerCardIcon ?? null,
  };
}

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
