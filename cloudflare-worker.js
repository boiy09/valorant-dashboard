/**
 * Cloudflare Worker – Valorant Tracker.gg proxy
 *
 * 환경변수 (Workers → Settings → Variables & Secrets):
 *   TRACKER_GG_API_KEY  (필수) – tracker.gg TRN API 키
 *
 * 응답 형식은 /api/tracker 와 동일하므로 클라이언트 코드를 수정할 필요가 없습니다.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BASE_URL = "https://public-api.tracker.gg/v2/valorant/standard";

function jsonRes(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

function statVal(stat) {
  if (stat && typeof stat === "object" && "value" in stat) {
    const v = stat.value;
    return typeof v === "number" ? v : 0;
  }
  return 0;
}

function statMeta(stat, field) {
  if (stat && typeof stat === "object" && "metadata" in stat) {
    const val = stat.metadata?.[field];
    return typeof val === "string" ? val : "";
  }
  return "";
}

function formatSeasonLabel(key) {
  // e.g. "e9a3" → "에피소드 9 액트 3"
  const m = key.match(/^e(\d+)a(\d+)$/i);
  if (m) return `에피소드 ${m[1]} 액트 ${m[2]}`;
  return key;
}

function normalizeTierName(name, tier) {
  if (!name && tier <= 0) return null;
  return name || null;
}

async function fetchProfile(gameName, tagLine, apiKey) {
  const encoded = `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  const [profileRes, agentRes] = await Promise.all([
    fetch(`${BASE_URL}/profile/riot/${encoded}`, {
      headers: { "TRN-Api-Key": apiKey, Accept: "application/json" },
    }),
    fetch(`${BASE_URL}/profile/riot/${encoded}/segments/agent`, {
      headers: { "TRN-Api-Key": apiKey, Accept: "application/json" },
    }),
  ]);

  if (!profileRes.ok) {
    const err = Object.assign(new Error(`tracker.gg ${profileRes.status}`), {
      status: profileRes.status,
    });
    throw err;
  }

  const profileJson = await profileRes.json();
  const segments = profileJson?.data?.segments ?? [];

  // overview
  const overviewSeg = segments.find((s) => s.type === "overview");
  const ov = overviewSeg?.stats ?? {};
  const matchesPlayed = Math.round(statVal(ov.matchesPlayed));
  const wins = Math.round(statVal(ov.wins));

  const stats = {
    matchesPlayed,
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    kd: Math.round(statVal(ov.kRatio) * 100) / 100,
    headshotPct: Math.round(statVal(ov.headshotsPercentage) * 10) / 10,
    killsPerRound: Math.round(statVal(ov.killsPerRound) * 100) / 100,
    scorePerRound: Math.round(statVal(ov.scorePerRound)),
    damagePerRound: Math.round(statVal(ov.damagePerRound)),
  };

  // seasons
  const seasons = segments
    .filter((s) => s.type === "season")
    .map((s) => {
      const seasonKey = s.attributes?.season ?? "";
      const st = s.stats ?? {};
      const mp = Math.round(statVal(st.matchesPlayed));
      const w = Math.round(statVal(st.wins));
      return {
        season: seasonKey,
        label: formatSeasonLabel(seasonKey),
        rankName: normalizeTierName(statMeta(st.rank, "tierName"), Math.round(statVal(st.rank))),
        tier: Math.round(statVal(st.rank)),
        matchesPlayed: mp,
        wins: w,
        winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
      };
    })
    .filter((s) => s.matchesPlayed > 0)
    .sort((a, b) => b.season.localeCompare(a.season));

  // agents
  let agents = [];
  if (agentRes.ok) {
    const agentJson = await agentRes.json();
    agents = (agentJson?.data ?? [])
      .map((s) => {
        const st = s.stats ?? {};
        const meta = s.metadata ?? {};
        const mp = Math.round(statVal(st.matchesPlayed));
        const w = Math.round(statVal(st.wins));
        return {
          name: meta.name ?? "Unknown",
          imageUrl: meta.imageUrl ?? "",
          matchesPlayed: mp,
          winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
          kd: Math.round(statVal(st.kRatio) * 100) / 100,
          damagePerRound: Math.round(statVal(st.damagePerRound)),
        };
      })
      .filter((a) => a.matchesPlayed > 0)
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
  }

  return { stats, seasons, agents };
}

export default {
  async fetch(request, env) {
    // preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonRes({ error: "Method not allowed" }, 405);
    }

    const apiKey = env.TRACKER_GG_API_KEY;
    if (!apiKey) {
      return jsonRes({ error: "TRACKER_GG_API_KEY 환경변수가 설정되지 않았습니다." }, 503);
    }

    const url = new URL(request.url);
    const gameName = url.searchParams.get("gameName");
    const tagLine = url.searchParams.get("tagLine");
    const region = (url.searchParams.get("region") ?? "KR").toUpperCase();

    if (!gameName || !tagLine) {
      return jsonRes({ error: "gameName과 tagLine이 필요합니다." }, 400);
    }

    try {
      const { stats, seasons, agents } = await fetchProfile(gameName, tagLine, apiKey);

      return jsonRes(
        { gameName, tagLine, region, stats, agents, seasons, source: "trackergg" },
        200,
        { "X-Tracker-Source": "trackergg", "X-Tracker-Cache": "MISS" }
      );
    } catch (err) {
      const status = err?.status ?? 500;
      if (status === 404) return jsonRes({ error: "플레이어를 찾을 수 없습니다." }, 404);
      if (status === 429) return jsonRes({ error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도하세요." }, 429);
      if (status === 401 || status === 403) return jsonRes({ error: "API 권한이 유효하지 않습니다." }, 503);
      return jsonRes({ error: "통계 정보를 불러오지 못했습니다." }, 500);
    }
  },
};
