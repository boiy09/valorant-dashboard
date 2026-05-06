import { apiCache, TTL } from "@/lib/apiCache";

export interface OpGgRankFallback {
  tierId: number;
  tierName: string;
  rankIcon: string;
  isCurrent: boolean;
}

export interface OpGgProfileSnapshot {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  hasNextFlightData: boolean;
  title: string | null;
  description: string | null;
  rank: OpGgRankFallback | null;
  snippet: string;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"');
}

function getMetaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    html.match(new RegExp(`<meta\\s+name="${escaped}"\\s+content="([^"]*)"`, "i"))?.[1] ??
    html.match(new RegExp(`<meta\\s+property="${escaped}"\\s+content="([^"]*)"`, "i"))?.[1] ??
    null
  );
}

function parseRank(html: string): OpGgRankFallback | null {
  const decoded = decodeHtml(html);
  const currentTierId = Number(decoded.match(/"competitiveTier":(\d+)/)?.[1] ?? 0);
  const historyTierId = Number(
    decoded.match(/"tierHistories":\[\{"id":\d+,"seasonId":"[^"]+","tierId":(\d+)/)?.[1] ?? 0
  );
  const tierId = currentTierId || historyTierId;
  if (!tierId) return null;

  const tierPattern = new RegExp(
    `"id":${tierId},"name":"([^"]+)","localizedName":"([^"]+)","division":(\\d+)[^}]*"imageUrl":"([^"]+)"`,
    "i"
  );
  const tierMatch = decoded.match(tierPattern);
  if (!tierMatch) return null;

  const [, name, localizedName, division, imageUrl] = tierMatch;
  const tierName = division === "0" ? localizedName : `${localizedName} ${division}`;

  return {
    tierId,
    tierName: tierName || name,
    rankIcon: imageUrl,
    isCurrent: currentTierId > 0,
  };
}

export function buildOpGgValorantProfileUrls(gameName: string, tagLine: string) {
  const slug = `${gameName.trim()}-${tagLine.trim()}`;
  const encodedSlug = encodeURIComponent(slug);

  return [
    `https://op.gg/valorant/profile/${encodedSlug}`,
    `https://op.gg/ko/valorant/profile/${encodedSlug}`,
  ];
}

export async function fetchOpGgValorantProfile(
  gameName: string,
  tagLine: string
): Promise<OpGgProfileSnapshot | null> {
  const cacheKey = `opgg:profile:v2:${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
  const { data } = await apiCache.getOrFetch(cacheKey, TTL.LONG, async () => {
    const urls = buildOpGgValorantProfileUrls(gameName, tagLine);

    for (const url of urls) {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html",
        },
        cache: "no-store",
        redirect: "follow",
      }).catch(() => null);

      if (!response) continue;
      const html = await response.text();
      if (!response.ok) continue;

      const decoded = decodeHtml(html);
      return {
        requestedUrl: url,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        hasNextFlightData: decoded.includes("self.__next_f.push"),
        title: decoded.match(/<title>(.*?)<\/title>/i)?.[1] ?? null,
        description: getMetaContent(decoded, "description"),
        rank: parseRank(decoded),
        snippet: decoded.slice(0, 600),
      };
    }

    return null;
  });

  return data;
}

export async function getOpGgRankFallback(gameName: string, tagLine: string) {
  const profile = await fetchOpGgValorantProfile(gameName, tagLine);
  return profile?.rank ?? null;
}
