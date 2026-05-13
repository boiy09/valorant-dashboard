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
    data?: Array<{ uuid?: string; displayName?: string; type?: string | null; isActive?: boolean; startTime?: string; endTime?: string }>;
  };
  const seasons = (payload.data ?? [])
    .filter((season) => season.uuid && season.type?.toLowerCase().includes("act"))
    .map((season) => ({
      id: season.uuid!.toLowerCase(),
      label: season.displayName || formatValorantSeasonLabel(season.uuid!),
      isActive: Boolean(season.isActive) || (
        Boolean(season.startTime && season.endTime) &&
        new Date(season.startTime!).getTime() <= now &&
        now < new Date(season.endTime!).getTime()
      ),
      startTime: season.startTime ? new Date(season.startTime).getTime() : 0,
      endTime: season.endTime ? new Date(season.endTime).getTime() : 0,
    }))
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
  const matchIds = (history.History ?? [])
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

  return detailResults.flatMap((result) => {
    if (result.status !== "fulfilled") return [];

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

    for (const round of roundResults) {
      const playerStats = asArray<Record<string, unknown>>(round.playerStats);
      const mine = playerStats.find((entry) => entry.Subject === puuid);
      for (const damage of asArray<Record<string, unknown>>(mine?.damage)) {
        headshots += toNumber(damage.Headshots);
        bodyshots += toNumber(damage.Bodyshots);
        legshots += toNumber(damage.Legshots);
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
      mode: firstString(matchInfo.QueueID, "Unknown"),
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
      playedAt: new Date(toNumber(matchInfo.GameStartMillis, Date.now())),
      scoreboard: null,
    }];
  });
}
