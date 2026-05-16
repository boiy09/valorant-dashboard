/**
 * Riot Private API (PVP endpoints)
 * 공식 API가 아니므로 rate limit 및 변경에 주의
 */

import type { MatchStats, RankData, RankSeasonSummary } from "@/lib/valorant";
import { formatValorantSeasonLabel } from "@/lib/seasonLabel";
import { tierIdToKorean } from "@/lib/tierName";

const CLIENT_PLATFORM =
  "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

const VALORANT_API_BASE = "https://valorant-api.com/v1";

// 클라이언트 버전 캐시 (5분)
let cachedVersion: string | null = null;
let versionCachedAt = 0;
const VERSION_TTL = 5 * 60 * 1000;

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

type PrivateContent = {
  agents: Map<string, { name: string; icon: string }>;
  maps: Map<string, string>;
};

type PrivateSeason = {
  id: string;
  label: string;
  isActive: boolean;
  startTime: number;
  endTime: number;
};

type PrivateRankSeasonRecord = {
  CompetitiveTier?: number;
  RankedRating?: number;
  NumberOfGames?: number;
  NumberOfWins?: number;
};

let contentCache: { data: PrivateContent; cachedAt: number } | null = null;
let seasonsCache: { data: PrivateSeason[]; cachedAt: number } | null = null;
let tierIconCache: { data: Map<number, string>; cachedAt: number } | null = null;
const CONTENT_TTL = 60 * 60 * 1000;

async function getPrivateContent(): Promise<PrivateContent> {
  const now = Date.now();
  if (contentCache && now - contentCache.cachedAt < CONTENT_TTL) return contentCache.data;

  const [agentsRes, mapsRes] = await Promise.all([
    fetch(`${VALORANT_API_BASE}/agents?isPlayableCharacter=true&language=ko-KR`, { cache: "force-cache" }).catch(() => null),
    fetch(`${VALORANT_API_BASE}/maps?language=ko-KR`, { cache: "force-cache" }).catch(() => null),
  ]);

  const agents = new Map<string, { name: string; icon: string }>();
  const maps = new Map<string, string>();

  if (agentsRes?.ok) {
    const payload = await agentsRes.json() as { data?: Array<{ uuid?: string; displayName?: string; displayIcon?: string }> };
    for (const agent of payload.data ?? []) {
      if (!agent.uuid) continue;
      agents.set(agent.uuid.toLowerCase(), {
        name: agent.displayName ?? "Unknown",
        icon: agent.displayIcon ?? "",
      });
    }
  }

  if (mapsRes?.ok) {
    const payload = await mapsRes.json() as { data?: Array<{ uuid?: string; displayName?: string; mapUrl?: string }> };
    for (const map of payload.data ?? []) {
      const name = map.displayName ?? "Unknown";
      if (map.uuid) maps.set(map.uuid.toLowerCase(), name);
      if (map.mapUrl) maps.set(map.mapUrl.toLowerCase(), name);
    }
  }

  const data = { agents, maps };
  contentCache = { data, cachedAt: now };
  return data;
}

async function getPrivateSeasons(): Promise<PrivateSeason[]> {
  const now = Date.now();
  if (seasonsCache && now - seasonsCache.cachedAt < CONTENT_TTL) return seasonsCache.data;

  const response = await fetch(`${VALORANT_API_BASE}/seasons?language=ko-KR`, { cache: "force-cache" }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json() as {
    data?: Array<{
      uuid?: string;
      displayName?: string;
      type?: string | null;
      parentUuid?: string | null;
      isActive?: boolean;
      startTime?: string;
      endTime?: string;
    }>;
  };

  const all = payload.data ?? [];

  // 부모 항목(에피소드/V시즌)의 displayName 맵: uuid → displayName
  // 예) "에피소드 1", "V25", "V26"
  const parentNameMap = new Map<string, string>();
  for (const entry of all) {
    if (entry.uuid && !entry.parentUuid && entry.displayName) {
      parentNameMap.set(entry.uuid.toLowerCase(), entry.displayName);
    }
  }

  // parentUuid가 있는 항목 = 액트
  const seasons = all
    .filter((season) => season.uuid && season.parentUuid)
    .map((season) => {
      const startTime = season.startTime ? new Date(season.startTime).getTime() : 0;
      const endTime = season.endTime ? new Date(season.endTime).getTime() : 0;

      // 부모 displayName + 액트 displayName 직접 조합
      // 예) "V26" + "액트 III" → "V26 // 액트 III"
      // 예) "에피소드 1" + "액트 I" → "에피소드 1 // 액트 I"
      const parentName = parentNameMap.get(season.parentUuid!.toLowerCase()) ?? "";
      const actName = season.displayName ?? "";
      const label = parentName && actName
        ? `${parentName} // ${actName}`
        : (season.displayName || formatValorantSeasonLabel(season.uuid!));

      return {
        id: season.uuid!.toLowerCase(),
        label,
        isActive: Boolean(season.isActive) || (
          Boolean(season.startTime && season.endTime) &&
          new Date(season.startTime!).getTime() <= now &&
          now < new Date(season.endTime!).getTime()
        ),
        startTime,
        endTime,
      };
    })
    .sort((a, b) => b.startTime - a.startTime);

  seasonsCache = { data: seasons, cachedAt: now };
  return seasons;
}

async function getPrivateRankIconByTier(tierId: number) {
  if (tierId <= 0) return null;

  const now = Date.now();
  if (!tierIconCache || now - tierIconCache.cachedAt >= CONTENT_TTL) {
    const response = await fetch(`${VALORANT_API_BASE}/competitivetiers?language=ko-KR`, { cache: "force-cache" }).catch(() => null);
    const icons = new Map<number, string>();
    if (response?.ok) {
      const payload = await response.json() as {
        data?: Array<{ tiers?: Array<{ tier?: number; smallIcon?: string; largeIcon?: string }> }>;
      };
      for (const bundle of payload.data ?? []) {
        for (const tier of bundle.tiers ?? []) {
          if (typeof tier.tier === "number" && (tier.smallIcon || tier.largeIcon)) {
            icons.set(tier.tier, tier.smallIcon ?? tier.largeIcon ?? "");
          }
        }
      }
    }
    tierIconCache = { data: icons, cachedAt: now };
  }

  return tierIconCache.data.get(tierId) ?? null;
}

function selectCurrentSeasonRecord(
  records: Record<string, PrivateRankSeasonRecord>,
  seasons: PrivateSeason[]
) {
  const active = seasons.find((season) => season.isActive && records[season.id]);
  if (active) return { id: active.id, season: active, record: records[active.id] };

  for (const season of seasons) {
    const record = records[season.id];
    if ((record?.NumberOfGames ?? 0) > 0) return { id: season.id, season, record };
  }

  const fallback = Object.entries(records).find(([, record]) => (record.NumberOfGames ?? 0) > 0);
  return fallback ? { id: fallback[0], season: null, record: fallback[1] } : null;
}

async function buildRankSeasonSummary(id: string, season: PrivateSeason | null, record: PrivateRankSeasonRecord): Promise<RankSeasonSummary | null> {
  const tierId = record.CompetitiveTier ?? 0;
  if (tierId <= 0 && (record.NumberOfGames ?? 0) <= 0) return null;

  return {
    season: id,
    label: season?.label ?? formatValorantSeasonLabel(id),
    tierId,
    tierName: tierIdToKorean(tierId),
    wins: record.NumberOfWins ?? 0,
    games: record.NumberOfGames ?? 0,
    rankIcon: await getPrivateRankIconByTier(tierId),
  };
}

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
  tierUuid?: string;
  tierColor?: string;
}

export interface StoreBundle {
  name: string;
  displayIcon: string;
  cost: number;
  remainingSeconds: number;
  items: StoreBundleItem[];
}

export interface StoreBundleItem {
  name: string;
  displayIcon: string;
  type: string;
  basePrice: number;
  discountedPrice: number;
}

export interface StoreData {
  offers: StoreOffer[];
  bundles: StoreBundle[];
}

export interface WalletData {
  vp: number;
  radianite: number;
}

export interface BattlepassData {
  contractId: string;
  displayName: string | null;
  progressionTowardsObjective: number;
  objectiveXp: number;
  progressionEarnedThisAct: number;
  totalLevelsCompleted: number;
  currentTier: number;
  rewards: BattlepassReward[];
}

export interface BattlepassReward {
  tier: number;
  name: string;
  type: string;
  icon: string | null;
  amount: number;
  isCurrent: boolean;
}

// ────────────────────────────────────────────────────────────
// API 구현
// ────────────────────────────────────────────────────────────

type SkinLevelInfo = { name: string; displayIcon: string; tierUuid: string; tierColor: string };
let skinLevelCache: { data: Map<string, SkinLevelInfo>; cachedAt: number } | null = null;
let tierColorCache: { data: Map<string, string>; cachedAt: number } | null = null;

async function getContentTierColors(): Promise<Map<string, string>> {
  const now = Date.now();
  if (tierColorCache && now - tierColorCache.cachedAt < CONTENT_TTL) return tierColorCache.data;

  const response = await fetch(`${VALORANT_API_BASE}/contenttiers`, { cache: "force-cache" }).catch(() => null);
  const colors = new Map<string, string>();
  if (response?.ok) {
    const payload = await response.json() as {
      data?: Array<{ uuid?: string; highlightColor?: string }>;
    };
    for (const tier of payload.data ?? []) {
      if (tier.uuid && tier.highlightColor) {
        // highlightColor은 RRGGBBAA 8자리 hex
        const hex = tier.highlightColor.slice(0, 6);
        colors.set(tier.uuid.toLowerCase(), `#${hex}`);
      }
    }
  }
  tierColorCache = { data: colors, cachedAt: now };
  return colors;
}

async function getSkinLevelMap(): Promise<Map<string, SkinLevelInfo>> {
  const now = Date.now();
  if (skinLevelCache && now - skinLevelCache.cachedAt < CONTENT_TTL) return skinLevelCache.data;

  const [weaponsRes, tierColors] = await Promise.all([
    fetch(`${VALORANT_API_BASE}/weapons?language=ko-KR`, { cache: "force-cache" }).catch(() => null),
    getContentTierColors(),
  ]);

  const map = new Map<string, SkinLevelInfo>();
  if (weaponsRes?.ok) {
    const payload = await weaponsRes.json() as {
      data?: Array<{
        skins?: Array<{
          contentTierUuid?: string;
          levels?: Array<{ uuid?: string; displayName?: string; displayIcon?: string }>;
        }>;
      }>;
    };
    for (const weapon of payload.data ?? []) {
      for (const skin of weapon.skins ?? []) {
        const tierUuid = skin.contentTierUuid?.toLowerCase() ?? "";
        const tierColor = tierColors.get(tierUuid) ?? "";
        for (const level of skin.levels ?? []) {
          if (!level.uuid) continue;
          map.set(level.uuid.toLowerCase(), {
            name: level.displayName ?? "",
            displayIcon: level.displayIcon ?? "",
            tierUuid,
            tierColor,
          });
        }
      }
    }
  }

  skinLevelCache = { data: map, cachedAt: now };
  return map;
}

async function resolveSkinLevel(uuid: string): Promise<SkinLevelInfo> {
  const map = await getSkinLevelMap();
  return map.get(uuid.toLowerCase()) ?? { name: uuid, displayIcon: "", tierUuid: "", tierColor: "" };
}

type BundleInfo = { name: string; displayIcon: string; price: number };

let bundleListCache: BundleInfo[] | null = null;
let bundleListCachedAt = 0;
const BUNDLE_LIST_TTL = 30 * 60 * 1000;

type BattlepassContractLevel = {
  reward?: { type?: string; uuid?: string; amount?: number };
  xp?: number;
};

type BattlepassContractInfo = {
  displayName: string | null;
  levels: BattlepassContractLevel[];
};

type RewardInfo = {
  name: string;
  icon: string | null;
};

let battlepassContractsCache: { data: Map<string, BattlepassContractInfo>; cachedAt: number } | null = null;
const rewardInfoCache = new Map<string, RewardInfo>();

async function getBundleList(): Promise<Array<{ uuid: string } & BundleInfo>> {
  if (bundleListCache && Date.now() - bundleListCachedAt < BUNDLE_LIST_TTL) {
    return bundleListCache as Array<{ uuid: string } & BundleInfo>;
  }
  try {
    const response = await fetch(`${VALORANT_API_BASE}/bundles?language=ko-KR`);
    if (!response.ok) return [];
    const data = await response.json() as {
      data?: Array<{ uuid: string; displayName?: string; displayIcon?: string; price?: number }>;
    };
    const list = (data.data ?? []).map((b) => ({
      uuid: b.uuid,
      name: b.displayName ?? "",
      displayIcon: b.displayIcon ?? "",
      price: b.price ?? 0,
    }));
    bundleListCache = list;
    bundleListCachedAt = Date.now();
    return list;
  } catch {
    return [];
  }
}

async function getBattlepassContracts(): Promise<Map<string, BattlepassContractInfo>> {
  const now = Date.now();
  if (battlepassContractsCache && now - battlepassContractsCache.cachedAt < CONTENT_TTL) {
    return battlepassContractsCache.data;
  }

  const response = await fetch(`${VALORANT_API_BASE}/contracts?language=ko-KR`, { cache: "force-cache" }).catch(() => null);
  const map = new Map<string, BattlepassContractInfo>();
  if (response?.ok) {
    const payload = await response.json() as {
      data?: Array<{
        uuid?: string;
        displayName?: string;
        content?: {
          chapters?: Array<{
            levels?: BattlepassContractLevel[];
          }>;
        };
      }>;
    };

    for (const contract of payload.data ?? []) {
      if (!contract.uuid) continue;
      const levels: BattlepassContractLevel[] = [];
      for (const chapter of contract.content?.chapters ?? []) {
        levels.push(...(chapter.levels ?? []));
      }
      map.set(contract.uuid.toLowerCase(), {
        displayName: contract.displayName ?? null,
        levels,
      });
    }
  }

  battlepassContractsCache = { data: map, cachedAt: now };
  return map;
}

function rewardEndpoint(type: string) {
  const normalized = type.toLowerCase();
  if (normalized === "playercard") return "playercards";
  if (normalized === "spray") return "sprays";
  if (normalized === "title") return "playertitles";
  if (normalized === "equippablecharmlevel") return "buddies/levels";
  if (normalized === "equippableskinlevel") return "weapons/skinlevels";
  if (normalized === "currency") return "currencies";
  return null;
}

async function resolveBattlepassReward(type: string, uuid: string, amount: number): Promise<RewardInfo> {
  const key = `${type}:${uuid}`.toLowerCase();
  const cached = rewardInfoCache.get(key);
  if (cached) return cached;

  const endpoint = rewardEndpoint(type);
  if (!endpoint) return { name: type, icon: null };

  const response = await fetch(`${VALORANT_API_BASE}/${endpoint}/${uuid}?language=ko-KR`, {
    cache: "force-cache",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  let info: RewardInfo = { name: amount > 1 ? `${type} x${amount}` : type, icon: null };
  if (response?.ok) {
    const payload = await response.json() as {
      data?: {
        displayName?: string;
        titleText?: string;
        displayIcon?: string;
        largeArt?: string;
        smallIcon?: string;
      };
    };
    const data = payload.data;
    info = {
      name: data?.displayName ?? data?.titleText ?? info.name,
      icon: data?.displayIcon ?? data?.largeArt ?? data?.smallIcon ?? null,
    };
  }

  rewardInfoCache.set(key, info);
  return info;
}

async function enrichBattlepassData(
  base: Omit<BattlepassData, "displayName" | "objectiveXp" | "currentTier" | "rewards">
): Promise<BattlepassData> {
  const contracts = await getBattlepassContracts();
  const contract = contracts.get(base.contractId.toLowerCase()) ?? null;
  const currentTier = Math.max(1, base.totalLevelsCompleted + 1);
  const currentIndex = Math.max(0, currentTier - 1);
  const objectiveXp = contract?.levels[currentIndex]?.xp ?? 2000;
  const rewardLevels = contract?.levels.slice(currentIndex, currentIndex + 7) ?? [];
  const rewards = await Promise.all(
    rewardLevels.map(async (level, index) => {
      const reward = level.reward;
      if (!reward?.uuid || !reward.type) return null;
      const info = await resolveBattlepassReward(reward.type, reward.uuid, reward.amount ?? 1);
      return {
        tier: currentTier + index,
        name: info.name,
        type: reward.type,
        icon: info.icon,
        amount: reward.amount ?? 1,
        isCurrent: index === 0,
      };
    })
  );

  return {
    ...base,
    displayName: contract?.displayName ?? null,
    objectiveXp,
    currentTier,
    rewards: rewards.filter((reward): reward is BattlepassReward => reward !== null),
  };
}

async function checkCdnImage(uuid: string): Promise<string | null> {
  // GET 요청으로 실제 파일 존재 여부 확인 (HEAD는 CDN에서 막힐 수 있음)
  // 성공하면 브라우저 hotlink 차단 우회를 위해 프록시 URL 반환
  for (const filename of ["displayicon.png", "displayicon2.png", "verticalpromoimage.png"]) {
    const cdnUrl = `https://media.valorant-api.com/bundles/${uuid}/${filename}`;
    try {
      const r = await fetch(cdnUrl, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        return `/api/bundle-image?u=${encodeURIComponent(cdnUrl)}`;
      }
    } catch {
      // 다음 파일명 시도
    }
  }
  return null;
}

function proxyBundleImage(url: string) {
  if (!url || url.startsWith("/api/bundle-image")) return url;
  return `/api/bundle-image?u=${encodeURIComponent(url)}`;
}

async function resolveBundle(uuid: string): Promise<BundleInfo | null> {
  // 1. valorant-api.com 직접 UUID 조회
  try {
    const response = await fetch(`${VALORANT_API_BASE}/bundles/${uuid}?language=ko-KR`);
    if (response.ok) {
      const data = await response.json() as {
        data?: { displayName?: string; displayIcon?: string; price?: number };
      };
      if (data.data?.displayName) {
        return {
          name: data.data.displayName,
          displayIcon: proxyBundleImage(data.data.displayIcon ?? ""),
          price: data.data.price ?? 0,
        };
      }
    }
  } catch {
    // 폴백
  }

  // 2. 전체 번들 목록에서 UUID 검색
  try {
    const list = await getBundleList();
    const found = list.find((b) => b.uuid.toLowerCase() === uuid.toLowerCase());
    if (found) return found;
  } catch {
    // 폴백
  }

  // 3. CDN 직접 접근 (API에 없어도 CDN에 이미지 파일이 존재할 수 있음)
  try {
    const cdnIcon = await checkCdnImage(uuid);
    if (cdnIcon) return { name: "", displayIcon: cdnIcon, price: 0 };
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

  // v3 POST (최신 방식)
  const response = await fetch(
    `https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`,
    { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[store] v3 POST 실패 ${response.status} shard=${shard}:`, body.slice(0, 300));
    throw new Error(`상점 조회 실패 (${response.status}) shard=${shard} body=${body.slice(0, 100)}`);
  }

  const VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";

  type BundleItem = {
    Item?: { ItemTypeID?: string; ItemID?: string };
    BasePrice?: number;
    DiscountedPrice?: number;
    CurrencyID?: string;
  };

  type BundlePayload = {
    ID?: string;
    DataAssetID?: string;
    TotalDiscountedCost?: Record<string, number>;
    DurationRemainingInSeconds?: number;
    Items?: BundleItem[];
  };

  function isBundlePayload(value: unknown): value is BundlePayload {
    if (!value || typeof value !== "object") return false;
    const candidate = value as BundlePayload;
    return Array.isArray(candidate.Items) && Boolean(candidate.DataAssetID || candidate.ID || candidate.TotalDiscountedCost);
  }

  function collectBundlePayloads(value: unknown, output: BundlePayload[] = []): BundlePayload[] {
    if (!value || typeof value !== "object") return output;
    if (isBundlePayload(value)) {
      output.push(value);
      return output;
    }
    if (Array.isArray(value)) {
      for (const item of value) collectBundlePayloads(item, output);
      return output;
    }
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectBundlePayloads(item, output);
    }
    return output;
  }

  const data = await response.json() as {
    SkinsPanelLayout?: {
      SingleItemOffers?: string[];
      SingleItemOffersRemainingDurationInSeconds?: number;
      SingleItemStoreOffers?: Array<{
        OfferID?: string;
        Cost?: Record<string, number>;
      }>;
    };
    FeaturedBundle?: { Bundle?: BundlePayload };
    FeaturedBundles?: { Bundles?: BundlePayload[] };
  };

  // 스킨 오퍼
  const skinUuids = data.SkinsPanelLayout?.SingleItemOffers ?? [];
  const remainingSec = data.SkinsPanelLayout?.SingleItemOffersRemainingDurationInSeconds ?? 0;
  const storeOffers = data.SkinsPanelLayout?.SingleItemStoreOffers ?? [];
  const costMap = new Map<string, number>();
  for (const offer of storeOffers) {
    if (offer.OfferID && offer.Cost?.[VP_CURRENCY]) {
      costMap.set(offer.OfferID.toLowerCase(), offer.Cost[VP_CURRENCY]);
    }
  }

  const offers: StoreOffer[] = await Promise.all(
    skinUuids.map(async (uuid) => {
      const skin = await resolveSkinLevel(uuid);
      return {
        uuid,
        name: skin.name,
        displayIcon: skin.displayIcon,
        cost: costMap.get(uuid.toLowerCase()) ?? 0,
        remainingSeconds: remainingSec,
        tierUuid: skin.tierUuid,
        tierColor: skin.tierColor,
      };
    })
  );

  const ITEM_TYPE_ENDPOINTS: Record<string, string> = {
    "e7c63390-eda7-46e0-bb7a-a6abdacd2433": "weapons/skinlevels",
    "dd3bf334-87f3-40bd-b043-682a57a8dc3a": "sprays",
    "3f296c07-64c3-494c-923b-fe692a4fa1bd": "playercards",
    "77258665-71d1-4623-bc72-44db9bd5b3b3": "buddies/levels",
    "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475": "sprays",
  };

  async function resolveBundleItem(item: BundleItem): Promise<StoreBundleItem> {
    const itemId = item.Item?.ItemID ?? "";
    const itemTypeId = item.Item?.ItemTypeID?.toLowerCase() ?? "";
    const endpoint = ITEM_TYPE_ENDPOINTS[itemTypeId];
    const fallback = {
      name: itemId || "구성품",
      displayIcon: "",
      type: endpoint ?? "item",
      basePrice: item.BasePrice ?? 0,
      discountedPrice: item.DiscountedPrice ?? item.BasePrice ?? 0,
    };

    if (!itemId) return fallback;

    if (endpoint === "weapons/skinlevels") {
      const skin = await resolveSkinLevel(itemId).catch(() => null);
      if (skin) {
        return {
          ...fallback,
          name: skin.name || fallback.name,
          displayIcon: skin.displayIcon || fallback.displayIcon,
          type: "스킨",
        };
      }
    }

    if (!endpoint) return fallback;

    try {
      const response = await fetch(`${VALORANT_API_BASE}/${endpoint}/${itemId}?language=ko-KR`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return fallback;

      const data = await response.json() as {
        data?: {
          displayName?: string;
          titleText?: string;
          displayIcon?: string;
          largeArt?: string;
          smallIcon?: string;
        };
      };
      return {
        ...fallback,
        name: data.data?.displayName ?? data.data?.titleText ?? fallback.name,
        displayIcon: data.data?.displayIcon ?? data.data?.largeArt ?? data.data?.smallIcon ?? "",
        type: endpoint,
      };
    } catch {
      return fallback;
    }
  }

  async function processBundleRaw(bundleRaw: BundlePayload): Promise<StoreBundle | null> {
    const candidates = [bundleRaw.DataAssetID, bundleRaw.ID].filter(Boolean) as string[];
    let bundleInfo: BundleInfo | null = null;
    for (const uuid of candidates) {
      bundleInfo = await resolveBundle(uuid);
      if (bundleInfo) break;
    }

    let fallbackIcon = "";
    let fallbackName = "";
    if (!bundleInfo?.displayIcon) {
      const skinMap = await getSkinLevelMap();
      for (const item of bundleRaw.Items ?? []) {
        const itemId = item.Item?.ItemID ?? "";
        const skin = skinMap.get(itemId.toLowerCase());
        if (skin?.displayIcon) {
          fallbackIcon = skin.displayIcon;
          if (!fallbackName && skin.name) {
            const parts = skin.name.split(" ");
            fallbackName = parts.length > 1 ? parts.slice(0, -1).join(" ") + " 번들" : skin.name + " 번들";
          }
          break;
        }
        const endpoint = ITEM_TYPE_ENDPOINTS[item.Item?.ItemTypeID?.toLowerCase() ?? ""];
        if (endpoint) {
          try {
            const r = await fetch(`${VALORANT_API_BASE}/${endpoint}/${itemId}?language=ko-KR`, {
              signal: AbortSignal.timeout(3000),
            });
            if (r.ok) {
              const d = await r.json() as { data?: { displayIcon?: string; displayName?: string } };
              if (d.data?.displayIcon) {
                fallbackIcon = d.data.displayIcon;
                if (!fallbackName && d.data.displayName) fallbackName = d.data.displayName + " 번들";
                break;
              }
            }
          } catch { /* 다음 아이템 */ }
        }
      }
    }

    const totalCost =
      bundleRaw.TotalDiscountedCost?.[VP_CURRENCY] ??
      bundleInfo?.price ??
      (bundleRaw.Items ?? []).reduce((sum, item) => sum + (item.DiscountedPrice ?? item.BasePrice ?? 0), 0);
    const items = await Promise.all((bundleRaw.Items ?? []).map(resolveBundleItem));

    return {
      name: bundleInfo?.name || fallbackName || "번들",
      displayIcon: proxyBundleImage(bundleInfo?.displayIcon || fallbackIcon),
      cost: totalCost,
      remainingSeconds: bundleRaw.DurationRemainingInSeconds ?? 0,
      items,
    };
  }

  // 번들: v3 FeaturedBundles(복수) → v2 FeaturedBundle(단일) 순으로 모든 번들 처리
  const seenBundleIds = new Set<string>();
  const allBundlesRaw = collectBundlePayloads(data).filter((bundle) => {
    const id = (bundle.DataAssetID || bundle.ID || JSON.stringify(bundle)).toLowerCase();
    if (seenBundleIds.has(id)) return false;
    seenBundleIds.add(id);
    return true;
  });

  const bundles = (await Promise.all(allBundlesRaw.map(processBundleRaw)))
    .filter((b): b is StoreBundle => b !== null);

  console.log(`[store] offers=${offers.length} bundles=${bundles.map(b => b.name).join(", ") || "none"}`);
  return { offers, bundles };
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

  type ContractEntry = {
    ContractDefinitionID: string;
    ContractProgression?: { TotalProgressionEarned?: number };
    ProgressionLevelReached?: number;
    ProgressionTowardsNextLevel?: number;
  };

  const data = await response.json() as {
    ActiveSpecialContract?: string;
    Contracts?: ContractEntry[];
    BTEMilestone?: {
      TotalMilestonesCompleted?: number;
      ProgressionTowardsNextMilestone?: number;
      TotalProgressionEarned?: number;
      // 다른 가능한 필드명
      CurrentMilestoneLevel?: number;
      ProgressionTowardsNextLevel?: number;
    };
  };

  // 1. 기존 방식 (ActiveSpecialContract)
  const activeId = data.ActiveSpecialContract;
  if (activeId && data.Contracts) {
    const contract = data.Contracts.find((c) => c.ContractDefinitionID === activeId);
    if (contract) {
      return enrichBattlepassData({
        contractId: activeId,
        progressionTowardsObjective: contract.ProgressionTowardsNextLevel ?? 0,
        progressionEarnedThisAct: contract.ContractProgression?.TotalProgressionEarned ?? 0,
        totalLevelsCompleted: contract.ProgressionLevelReached ?? 0,
      });
    }
  }

  // 2. BTEMilestone (V시즌 신규 배틀패스 시스템)
  const bte = data.BTEMilestone;
  if (bte) {
    const level = bte.TotalMilestonesCompleted ?? bte.CurrentMilestoneLevel ?? 0;
    const towards = bte.ProgressionTowardsNextMilestone ?? bte.ProgressionTowardsNextLevel ?? 0;
    const total = bte.TotalProgressionEarned ?? 0;
    if (level > 0 || towards > 0 || total > 0) {
      return enrichBattlepassData({
        contractId: "bte",
        progressionTowardsObjective: towards,
        progressionEarnedThisAct: total,
        totalLevelsCompleted: level,
      });
    }
  }

  // 3. 폴백: 가장 진행도가 높은 계약
  if (data.Contracts?.length) {
    const best = [...data.Contracts]
      .filter((c) => (c.ContractProgression?.TotalProgressionEarned ?? 0) > 0)
      .sort((a, b) =>
        (b.ContractProgression?.TotalProgressionEarned ?? 0) -
        (a.ContractProgression?.TotalProgressionEarned ?? 0)
      )[0];
    if (best) {
      return enrichBattlepassData({
        contractId: best.ContractDefinitionID,
        progressionTowardsObjective: best.ProgressionTowardsNextLevel ?? 0,
        progressionEarnedThisAct: best.ContractProgression?.TotalProgressionEarned ?? 0,
        totalLevelsCompleted: best.ProgressionLevelReached ?? 0,
      });
    }
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// MMR / 프로필 (rate limit 없음)
// ────────────────────────────────────────────────────────────

export interface PrivateMMR {
  currentTierId: number;
  rankedRating: number;
}

export interface PrivateProfile {
  level: number;
  cardId: string;
}

export async function getPrivateMMR(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string
): Promise<PrivateMMR | null> {
  try {
    const shard = regionToShard(region);
    const headers = await pvpHeaders(accessToken, entitlementsToken);
    const response = await fetch(`https://pd.${shard}.a.pvp.net/mmr/v1/players/${puuid}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = await response.json() as {
      QueueSkills?: {
        competitive?: {
          SeasonalInfoBySeasonID?: Record<string, {
            CompetitiveTier?: number;
            RankedRating?: number;
            NumberOfGames?: number;
          }>;
        };
      };
    };

    const seasons = data.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {};
    // 가장 최근 시즌 (게임 수 > 0) 찾기
    const latest = selectCurrentSeasonRecord(seasons, await getPrivateSeasons())?.record;

    const tierId = latest?.CompetitiveTier ?? 0;
    if (tierId <= 0) return null;

    return { currentTierId: tierId, rankedRating: latest?.RankedRating ?? 0 };
  } catch {
    return null;
  }
}

export async function getPrivateRankData(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string
): Promise<RankData | null> {
  try {
    const shard = regionToShard(region);
    const headers = await pvpHeaders(accessToken, entitlementsToken);
    const response = await fetch(`https://pd.${shard}.a.pvp.net/mmr/v1/players/${puuid}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;

    const data = await response.json() as {
      QueueSkills?: {
        competitive?: {
          SeasonalInfoBySeasonID?: Record<string, PrivateRankSeasonRecord>;
        };
      };
    };

    const records = data.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {};
    const seasons = await getPrivateSeasons();
    const current = selectCurrentSeasonRecord(records, seasons);
    if (!current) return null;

    const currentIndex = seasons.findIndex((season) => season.id === current.id);
    const previousSeason = currentIndex >= 0 ? seasons.slice(currentIndex + 1).find((season) => records[season.id]) ?? null : null;
    const previousRecord = previousSeason ? records[previousSeason.id] : null;
    const peakEntry = Object.entries(records)
      .filter(([, record]) => (record.CompetitiveTier ?? 0) > 0)
      .sort((left, right) => {
        const tierDiff = (right[1].CompetitiveTier ?? 0) - (left[1].CompetitiveTier ?? 0);
        if (tierDiff !== 0) return tierDiff;
        const leftSeason = seasons.find((season) => season.id === left[0]);
        const rightSeason = seasons.find((season) => season.id === right[0]);
        return (rightSeason?.startTime ?? 0) - (leftSeason?.startTime ?? 0);
      })[0] ?? null;

    const currentSummary = await buildRankSeasonSummary(current.id, current.season, current.record);
    const previousSummary = previousRecord && previousSeason
      ? await buildRankSeasonSummary(previousSeason.id, previousSeason, previousRecord)
      : null;
    const peakSeason = peakEntry
      ? await buildRankSeasonSummary(peakEntry[0], seasons.find((season) => season.id === peakEntry[0]) ?? null, peakEntry[1])
      : null;

    const currentTierId = current.record.CompetitiveTier ?? 0;
    const peakTierId = peakEntry?.[1].CompetitiveTier ?? 0;
    const [rankIcon, peakRankIcon] = await Promise.all([
      getPrivateRankIconByTier(currentTierId),
      getPrivateRankIconByTier(peakTierId),
    ]);

    return {
      tier: tierIdToKorean(currentTierId),
      tierName: tierIdToKorean(currentTierId),
      tierId: currentTierId,
      rr: current.record.RankedRating ?? null,
      rrChange: null,
      isCurrent: currentTierId > 0,
      peakTier: peakTierId > 0 ? tierIdToKorean(peakTierId) : "기록 없음",
      peakTierName: peakTierId > 0 ? tierIdToKorean(peakTierId) : "기록 없음",
      wins: current.record.NumberOfWins ?? currentSummary?.wins ?? 0,
      games: current.record.NumberOfGames ?? currentSummary?.games ?? 0,
      rankIcon,
      peakRankIcon,
      currentSeason: currentSummary,
      previousSeason: previousSummary,
      peakSeason,
    };
  } catch {
    return null;
  }
}

export async function getPrivateProfile(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string
): Promise<PrivateProfile | null> {
  try {
    const shard = regionToShard(region);
    const headers = await pvpHeaders(accessToken, entitlementsToken);

    const [xpRes, loadoutRes] = await Promise.all([
      fetch(`https://pd.${shard}.a.pvp.net/account-xp/v1/players/${puuid}`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`https://pd.${shard}.a.pvp.net/personalization/v2/players/${puuid}/playerloadout`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);

    const level = xpRes.ok
      ? ((await xpRes.json()) as { Progress?: { Level?: number } }).Progress?.Level ?? 0
      : 0;

    const cardId = loadoutRes.ok
      ? ((await loadoutRes.json()) as { Identity?: { PlayerCardID?: string } }).Identity?.PlayerCardID ?? ""
      : "";

    if (!level && !cardId) return null;
    return { level, cardId };
  } catch {
    return null;
  }
}

const QUEUE_NAMES: Record<string, string> = {
  competitive: "경쟁전",
  unrated: "일반전",
  spikerush: "스파이크 돌진",
  deathmatch: "데스매치",
  escalation: "에스컬레이션",
  replication: "레플리케이션",
  swiftplay: "스위프트플레이",
  snowballfight: "눈싸움",
  onefa: "원포올",
  custom: "커스텀",
  premier: "프리미어",
  hurm: "팀 데스매치",
  ggteam: "에스컬레이션",
  newmap: "신규 맵",
};

export function queueIdToKorean(queueId: string): string {
  return QUEUE_NAMES[queueId.toLowerCase()] ?? queueId;
}

export interface PrivateRecentMatchesOptions {
  count?: number;
}

export async function getPrivateRecentMatches(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string,
  options?: PrivateRecentMatchesOptions
): Promise<MatchStats[]> {
  const count = Math.max(1, Math.min(options?.count ?? 10, 20));
  const shard = regionToShard(region);
  const headers = await pvpHeaders(accessToken, entitlementsToken);
  const historyRes = await fetch(
    `https://pd.${shard}.a.pvp.net/match-history/v1/history/${puuid}?startIndex=0&endIndex=${count}`,
    { headers, signal: AbortSignal.timeout(8000) }
  );

  if (!historyRes.ok) {
    throw new Error(`private match history failed: ${historyRes.status}`);
  }

  const history = await historyRes.json() as { History?: Array<{ MatchID?: string }> };
  const historyItems = history.History ?? [];
  const matchIds = historyItems
    .map((item) => item.MatchID)
    .filter((id): id is string => Boolean(id));

  if (!matchIds.length) return [];

  const content = await getPrivateContent();
  const detailResults = await Promise.allSettled(
    matchIds.map(async (matchId) => {
      const detailRes = await fetch(`https://pd.${shard}.a.pvp.net/match-details/v1/matches/${matchId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!detailRes.ok) throw new Error(`private match detail failed: ${detailRes.status}`);
      return detailRes.json();
    })
  );

  const detailed = detailResults.flatMap((result) => {
    if (result.status !== "fulfilled") {
      console.warn("[private-match] match detail failed:", result.reason);
      return [];
    }

    const detail = asRecord(result.value);
    const matchInfo = asRecord(detail.matchInfo);
    const players = asArray<Record<string, unknown>>(detail.players);
    const teams = asArray<Record<string, unknown>>(detail.teams);
    const me = players.find((player) => player.Subject === puuid);
    if (!me) return [];

    const stats = asRecord(me.stats);
    const teamId = firstString(me.TeamID);
    const myTeam = teams.find((team) => team.TeamID === teamId);
    const otherTeam = teams.find((team) => team.TeamID !== teamId);
    const characterId = firstString(me.CharacterID).toLowerCase();
    const agent = content.agents.get(characterId);
    const mapName = content.maps.get(firstString(matchInfo.MapID).toLowerCase()) ?? "Unknown";
    const roundResults = asArray<Record<string, unknown>>(detail.roundResults);
    let headshots = 0;
    let bodyshots = 0;
    let legshots = 0;
    let totalDamage = 0;

    for (const round of roundResults) {
      const playerStats = asArray<Record<string, unknown>>(round.playerStats);
      const mine = playerStats.find((entry) => entry.Subject === puuid);
      for (const damage of asArray<Record<string, unknown>>(mine?.damage)) {
        headshots += toNumber(damage.Headshots);
        bodyshots += toNumber(damage.Bodyshots);
        legshots += toNumber(damage.Legshots);
        totalDamage += toNumber(damage.damage);
      }
    }

    const kills = toNumber(stats.kills);
    const deaths = toNumber(stats.deaths);
    const assists = toNumber(stats.assists);
    const roundsPlayed = toNumber(stats.roundsPlayed) || roundResults.length;
    const teamScore = toNumber(myTeam?.RoundsWon, -1);
    const enemyScore = toNumber(otherTeam?.RoundsWon, -1);

    return [{
      matchId: firstString(matchInfo.MatchID),
      map: mapName,
      mode: queueIdToKorean(firstString(matchInfo.QueueID)) || firstString(matchInfo.QueueID) || "Unknown",
      agent: agent?.name ?? "Unknown",
      agentIcon: agent?.icon ?? "",
      result: (myTeam?.Won === true ? "?밸━" : otherTeam?.Won === true ? "?⑤같" : "臾댄슚") as MatchStats["result"],
      kills,
      deaths,
      assists,
      score: roundsPlayed > 0 ? Math.round(toNumber(stats.score) / roundsPlayed) : 0,
      teamScore: teamScore >= 0 ? teamScore : null,
      enemyScore: enemyScore >= 0 ? enemyScore : null,
      headshots,
      bodyshots,
      legshots,
      adr: roundsPlayed > 0 ? Math.round(totalDamage / roundsPlayed) : null,
      playedAt: new Date(toNumber(matchInfo.GameStartMillis, Date.now())),
      scoreboard: null,
    }];
  });

  if (detailed.length > 0) return detailed;

  if (historyItems.length > 0) {
    throw new Error("PVP match-history는 받았지만 match-details 상세 조회가 모두 실패했습니다.");
  }

  return [];

}

export interface CompetitiveUpdate {
  matchId: string;
  mapName: string;
  startTime: number;
  tierAfter: number;
  rrAfter: number;
  rrEarned: number;
}

export async function getPrivateCompetitiveUpdates(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string,
  count = 20
): Promise<CompetitiveUpdate[]> {
  try {
    const shard = regionToShard(region);
    const headers = await pvpHeaders(accessToken, entitlementsToken);
    const res = await fetch(
      `https://pd.${shard}.a.pvp.net/mmr/v1/players/${puuid}/competitiveupdates?queue=competitive&startIndex=0&endIndex=${count}`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`competitiveupdates ${res.status}`);
    const data = await res.json() as {
      Matches?: Array<{
        MatchID?: string;
        MapID?: string;
        MatchStartTime?: number;
        TierAfterUpdate?: number;
        RankedRatingAfterUpdate?: number;
        RankedRatingEarned?: number;
      }>;
    };
    const content = await getPrivateContent();
    return (data.Matches ?? []).map((m) => ({
      matchId: m.MatchID ?? "",
      mapName: content.maps.get(firstString(m.MapID).toLowerCase()) ?? "Unknown",
      startTime: m.MatchStartTime ?? 0,
      tierAfter: m.TierAfterUpdate ?? 0,
      rrAfter: m.RankedRatingAfterUpdate ?? 0,
      rrEarned: m.RankedRatingEarned ?? 0,
    }));
  } catch {
    return [];
  }
}

export interface PlayerPresence {
  inCoreGame: boolean;
  inPreGame: boolean;
  matchId: string | null;
}

export async function getPlayerPresence(
  puuid: string,
  region: string,
  accessToken: string,
  entitlementsToken: string
): Promise<PlayerPresence> {
  const shard = regionToShard(region);
  const glzBase = `https://glz-${shard}-1.${shard}.a.pvp.net`;
  const headers = await pvpHeaders(accessToken, entitlementsToken);
  const signal = AbortSignal.timeout(5000);

  // 코어 게임 (진행 중인 경기)
  try {
    const res = await fetch(`${glzBase}/core-game/v1/players/${puuid}`, { headers, signal });
    if (res.ok) {
      const data = await res.json() as { MatchID?: string };
      if (data.MatchID) return { inCoreGame: true, inPreGame: false, matchId: data.MatchID };
    }
  } catch { /* 게임 중 아님 */ }

  // 프리게임 (로딩 중인 경기)
  try {
    const res = await fetch(`${glzBase}/pregame/v1/players/${puuid}`, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as { MatchID?: string };
      if (data.MatchID) return { inCoreGame: false, inPreGame: true, matchId: data.MatchID };
    }
  } catch { /* 프리게임 중 아님 */ }

  return { inCoreGame: false, inPreGame: false, matchId: null };
}
