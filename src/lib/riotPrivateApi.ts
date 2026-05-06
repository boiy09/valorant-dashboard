/**
 * Riot Private API (PVP endpoints)
 * 공식 API가 아니므로 rate limit 및 변경에 주의
 */

const CLIENT_PLATFORM =
  "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

const VALORANT_API_BASE = "https://valorant-api.com/v1";

// 클라이언트 버전 캐시 (5분)
let cachedVersion: string | null = null;
let versionCachedAt = 0;
const VERSION_TTL = 5 * 60 * 1000;

async function getClientVersion(): Promise<string> {
  const now = Date.now();
  if (cachedVersion && now - versionCachedAt < VERSION_TTL) {
    return cachedVersion;
  }

  try {
    const response = await fetch(`${VALORANT_API_BASE}/version`);
    if (response.ok) {
      const data = await response.json() as { data?: { riotClientVersion?: string } };
      const version = data.data?.riotClientVersion ?? "release-09.10-shipping-9-2900357";
      cachedVersion = version;
      versionCachedAt = now;
      return version;
    }
  } catch {
    // 폴백
  }

  return "release-09.10-shipping-9-2900357";
}

async function pvpHeaders(
  accessToken: string,
  entitlementsToken: string
): Promise<Record<string, string>> {
  const version = await getClientVersion();
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Riot-Entitlements-JWT": entitlementsToken,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": version,
    "User-Agent": `RiotClient/${version} rso-auth (Windows;10;;Professional, x64)`,
    "Accept": "application/json",
  };
}

function regionToShard(region: string): string {
  const lower = region.toLowerCase();
  switch (lower) {
    case "kr":
      return "kr";
    case "ap":
      return "ap";
    case "na":
      return "na";
    case "eu":
      return "eu";
    default:
      return lower;
  }
}

// ────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────

export interface StoreOffer {
  uuid: string;
  name: string;
  displayIcon: string;
  cost: number;
  remainingSeconds: number;
}

export interface StoreBundle {
  name: string;
  displayIcon: string;
  cost: number;
  remainingSeconds: number;
}

export interface StoreData {
  offers: StoreOffer[];
  bundle?: StoreBundle;
}

export interface WalletData {
  vp: number;
  radianite: number;
}

export interface BattlepassData {
  contractId: string;
  progressionTowardsObjective: number;
  progressionEarnedThisAct: number;
  totalLevelsCompleted: number;
}

// ────────────────────────────────────────────────────────────
// API 구현
// ────────────────────────────────────────────────────────────

async function resolveSkinLevel(uuid: string): Promise<{ name: string; displayIcon: string }> {
  try {
    const response = await fetch(`${VALORANT_API_BASE}/weapons/skinlevels/${uuid}`);
    if (response.ok) {
      const data = await response.json() as { data?: { displayName?: string; displayIcon?: string } };
      return {
        name: data.data?.displayName ?? uuid,
        displayIcon: data.data?.displayIcon ?? "",
      };
    }
  } catch {
    // 폴백
  }
  return { name: uuid, displayIcon: "" };
}

async function resolveBundle(uuid: string): Promise<{ name: string; displayIcon: string; price: number } | null> {
  try {
    const response = await fetch(`${VALORANT_API_BASE}/bundles/${uuid}`);
    if (response.ok) {
      const data = await response.json() as {
        data?: { displayName?: string; displayIcon?: string; price?: number };
      };
      return {
        name: data.data?.displayName ?? uuid,
        displayIcon: data.data?.displayIcon ?? "",
        price: data.data?.price ?? 0,
      };
    }
  } catch {
    // 폴백
  }
  return null;
}

export async function getStore(
  puuid: string,
  accessToken: string,
  entitlementsToken: string,
  region: string
): Promise<StoreData> {
  const shard = regionToShard(region);
  const headers = await pvpHeaders(accessToken, entitlementsToken);

  let response = await fetch(
    `https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`,
    { headers }
  );

  // v3가 실패하면 v2 시도
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[store] v3 실패 ${response.status}:`, body.slice(0, 200));
    response = await fetch(
      `https://pd.${shard}.a.pvp.net/store/v2/storefront/${puuid}`,
      { headers }
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[store] v2 실패 ${response.status}:`, body.slice(0, 200));
    throw new Error(`상점 조회 실패: ${response.status}`);
  }

  const data = await response.json() as {
    SkinsPanelLayout?: {
      SingleItemOffers?: string[];
      SingleItemOffersRemainingDurationInSeconds?: number;
    };
    FeaturedBundle?: {
      Bundle?: {
        DataAssetID?: string;
        TotalDiscountedCost?: Record<string, number>;
        DurationRemainingInSeconds?: number;
      };
    };
  };

  // 개인 스킨 오퍼 resolve
  const skinUuids = data.SkinsPanelLayout?.SingleItemOffers ?? [];
  const remainingSec = data.SkinsPanelLayout?.SingleItemOffersRemainingDurationInSeconds ?? 0;

  const offers: StoreOffer[] = await Promise.all(
    skinUuids.map(async (uuid) => {
      const skin = await resolveSkinLevel(uuid);
      return {
        uuid,
        name: skin.name,
        displayIcon: skin.displayIcon,
        cost: 0, // 개별 VP 가격은 별도 API 필요, 기본값 0
        remainingSeconds: remainingSec,
      };
    })
  );

  // 번들
  let bundle: StoreBundle | undefined;
  const bundleData = data.FeaturedBundle?.Bundle;
  if (bundleData?.DataAssetID) {
    const bundleInfo = await resolveBundle(bundleData.DataAssetID);
    if (bundleInfo) {
      // TotalDiscountedCost에서 VP 화폐 UUID로 가격 추출
      const VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
      const cost =
        bundleData.TotalDiscountedCost?.[VP_CURRENCY] ?? bundleInfo.price;
      bundle = {
        name: bundleInfo.name,
        displayIcon: bundleInfo.displayIcon,
        cost,
        remainingSeconds: bundleData.DurationRemainingInSeconds ?? 0,
      };
    }
  }

  return { offers, bundle };
}

export async function getWallet(
  puuid: string,
  accessToken: string,
  entitlementsToken: string,
  region: string
): Promise<WalletData> {
  const shard = regionToShard(region);
  const headers = await pvpHeaders(accessToken, entitlementsToken);

  const response = await fetch(
    `https://pd.${shard}.a.pvp.net/store/v1/wallet/${puuid}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`지갑 조회 실패: ${response.status}`);
  }

  const data = await response.json() as {
    Balances?: Record<string, number>;
  };

  const VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
  const RAD_CURRENCY = "e59aa87c-4cbf-517a-5983-6e81511be9b7";

  return {
    vp: data.Balances?.[VP_CURRENCY] ?? 0,
    radianite: data.Balances?.[RAD_CURRENCY] ?? 0,
  };
}

export async function getBattlepass(
  puuid: string,
  accessToken: string,
  entitlementsToken: string,
  region: string
): Promise<BattlepassData | null> {
  const shard = regionToShard(region);
  const headers = await pvpHeaders(accessToken, entitlementsToken);

  const response = await fetch(
    `https://pd.${shard}.a.pvp.net/contracts/v1/contracts/${puuid}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`배틀패스 조회 실패: ${response.status}`);
  }

  const data = await response.json() as {
    ActiveSpecialContract?: string;
    Contracts?: Array<{
      ContractDefinitionID: string;
      ContractProgression?: {
        TotalProgressionEarned?: number;
        TotalProgressionEarnedVersion?: number;
        HighestRewardedLevel?: Record<string, unknown>;
      };
      ProgressionLevelReached?: number;
      ProgressionTowardsNextLevel?: number;
    }>;
  };

  const activeId = data.ActiveSpecialContract;
  if (!activeId || !data.Contracts) return null;

  const contract = data.Contracts.find((c) => c.ContractDefinitionID === activeId);
  if (!contract) return null;

  return {
    contractId: activeId,
    progressionTowardsObjective: contract.ProgressionTowardsNextLevel ?? 0,
    progressionEarnedThisAct: contract.ContractProgression?.TotalProgressionEarned ?? 0,
    totalLevelsCompleted: contract.ProgressionLevelReached ?? 0,
  };
}
