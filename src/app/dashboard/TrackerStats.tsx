"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeTierName } from "@/lib/tierName";

type RiotRegion = "KR" | "AP";

interface CareerStats {
  matchesPlayed: number;
  winRate: number;
  kd: number;
  headshotPct: number;
  killsPerRound: number;
  scorePerRound: number;
  damagePerRound: number;
}

interface AgentStat {
  name: string;
  imageUrl: string;
  matchesPlayed: number;
  winRate: number;
  kd: number;
  damagePerRound: number;
}

interface SeasonStat {
  season: string;
  label: string;
  rankName: string | null;
  tier: number;
  matchesPlayed: number;
  wins: number;
  winRate: number;
}

interface RateLimit {
  limit: number;
  remaining: number;
  resetInSecs: number;
}

interface CareerData {
  gameName: string;
  tagLine: string;
  region: RiotRegion;
  stats: CareerStats;
  agents: AgentStat[];
  seasons: SeasonStat[];
  rateLimit?: RateLimit;
  source?: string;
  cached?: boolean;
  cacheAgeSec?: number;
}

interface Props {
  gameName: string;
  tagLine: string;
  region?: RiotRegion;
}

const SESSION_CACHE_TTL_MS = 1000 * 60 * 10;

function tierColor(tier: number) {
  if (tier >= 24) return "text-[#ff4655]";
  if (tier >= 21) return "text-[#f0b429]";
  if (tier >= 18) return "text-[#a855f7]";
  if (tier >= 15) return "text-[#3b82f6]";
  if (tier >= 12) return "text-[#4ade80]";
  if (tier >= 9) return "text-[#f97316]";
  if (tier >= 6) return "text-[#b45309]";
  if (tier >= 3) return "text-[#6b7280]";
  return "text-[#7b8a96]";
}

function formatResetTime(secs: number) {
  if (!secs || secs <= 0) return null;
  if (secs < 60) return `${secs}초 뒤 초기화`;
  return `${Math.ceil(secs / 60)}분 뒤 초기화`;
}

function buildSessionCacheKey(gameName: string, tagLine: string, region: RiotRegion) {
  return `tracker-stats:${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}@${region}`;
}

export default function TrackerStats({ gameName, tagLine, region = "KR" }: Props) {
  const [data, setData] = useState<CareerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const sessionCacheKey = useMemo(
    () => buildSessionCacheKey(gameName, tagLine, region),
    [gameName, tagLine, region]
  );

  useEffect(() => {
    setData(null);
    setError(null);
    setLoaded(false);

    try {
      const raw = sessionStorage.getItem(sessionCacheKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { data: CareerData; cachedAt: number };
      if (!parsed?.data || !parsed?.cachedAt) return;

      if (Date.now() - parsed.cachedAt > SESSION_CACHE_TTL_MS) {
        sessionStorage.removeItem(sessionCacheKey);
        return;
      }

      setData({
        ...parsed.data,
        cached: true,
        cacheAgeSec: Math.floor((Date.now() - parsed.cachedAt) / 1000),
      });
      setLoaded(true);
    } catch {
      sessionStorage.removeItem(sessionCacheKey);
    }
  }, [sessionCacheKey]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const endpoint = `/api/tracker?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}&region=${region}`;

      const response = await fetch(endpoint);
      const payload = await response.json();

      if (!response.ok || payload.error) {
        setError(payload.error ?? "데이터를 불러오지 못했습니다.");
        return;
      }

      setData(payload);
      setLoaded(true);
      sessionStorage.setItem(
        sessionCacheKey,
        JSON.stringify({
          data: payload,
          cachedAt: Date.now(),
        })
      );
    } catch {
      setError("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading && !error) {
    return (
      <div className="val-card p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[#7b8a96] text-sm">최근 20경기 통계</span>
          <span className="text-[#4a5a68] text-[11px]">
            동일한 요청은 잠시 캐시해서 외부 API 호출을 줄입니다.
          </span>
        </div>
        <button
          onClick={load}
          className="text-xs bg-[#ff4655] text-white font-bold px-4 py-1.5 rounded hover:bg-[#ff4655]/80 transition-colors"
        >
          불러오기
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="val-card p-5 flex items-center gap-3">
        <div className="w-3 h-3 border-2 border-[#ff4655] border-t-transparent rounded-full animate-spin" />
        <span className="text-[#7b8a96] text-sm">전적 통계를 불러오는 중입니다.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="val-card p-4 flex items-center justify-between gap-4">
        <span className="text-[#ff4655] text-sm">{error}</span>
        <button
          onClick={load}
          className="text-xs text-[#7b8a96] hover:text-white px-3 py-1 border border-[#2a3540] rounded transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { stats, agents, seasons, rateLimit } = data;

  const statItems = [
    { label: "최근 경기 수", value: `${stats.matchesPlayed}경기`, color: "" },
    {
      label: "승률",
      value: `${stats.winRate}%`,
      color: stats.winRate >= 50 ? "text-green-400" : "text-[#ff4655]",
    },
    {
      label: "KD 비율",
      value: stats.kd.toString(),
      color: stats.kd >= 1 ? "text-green-400" : "text-[#ff4655]",
    },
    {
      label: "헤드샷률",
      value: `${stats.headshotPct}%`,
      color: stats.headshotPct >= 20 ? "text-green-400" : "",
    },
    { label: "라운드당 킬", value: stats.killsPerRound.toString(), color: "" },
    { label: "라운드당 점수", value: stats.scorePerRound.toString(), color: "" },
    {
      label: "라운드당 피해",
      value: stats.damagePerRound.toString(),
      color: stats.damagePerRound >= 150 ? "text-green-400" : "",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="val-card p-5">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-[#7b8a96] text-xs tracking-widest uppercase">
            <span>최근 20경기 통계</span>
            <span className="text-[#4a5a68] normal-case tracking-normal">
              {data.cached ? `캐시 사용 (${data.cacheAgeSec ?? 0}초 전)` : "새로 조회"}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {rateLimit && rateLimit.limit > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span
                  className={`font-bold ${
                    rateLimit.remaining <= 5
                      ? "text-[#ff4655]"
                      : rateLimit.remaining <= 15
                        ? "text-yellow-400"
                        : "text-green-400"
                  }`}
                >
                  {rateLimit.remaining}/{rateLimit.limit}
                </span>
                <span className="text-[#4a5a68]">남은 요청</span>
                {formatResetTime(rateLimit.resetInSecs) && (
                  <span className="text-[#4a5a68]">· {formatResetTime(rateLimit.resetInSecs)}</span>
                )}
              </div>
            )}
            <button
              onClick={load}
              className="text-xs text-[#7b8a96] hover:text-white px-3 py-1 border border-[#2a3540] rounded transition-colors"
            >
              새로 조회
            </button>
            <a
              href={`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${gameName}#${tagLine}`)}/overview`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7b8a96] text-xs hover:text-[#ff4655] transition-colors"
            >
              tracker.gg 보기
            </a>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {statItems.map((item) => (
            <div key={item.label} className="bg-[#111c24] rounded-lg p-3 text-center">
              <div className={`font-black text-base ${item.color || "text-white"}`}>{item.value}</div>
              <div className="text-[#7b8a96] text-[10px] mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {agents.length > 0 && (
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">에이전트별 통계</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.slice(0, 9).map((agent) => (
              <div key={agent.name} className="bg-[#111c24] rounded-lg p-3 flex items-center gap-3">
                {agent.imageUrl ? (
                  <img
                    src={agent.imageUrl}
                    alt={agent.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-[#2a3540] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-bold truncate">{agent.name}</div>
                  <div className="text-[#7b8a96] text-xs">{agent.matchesPlayed}경기</div>
                  <div className="grid grid-cols-3 gap-1 mt-1.5">
                    <div className="text-center">
                      <div
                        className={`text-xs font-bold ${
                          agent.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"
                        }`}
                      >
                        {agent.winRate}%
                      </div>
                      <div className="text-[#7b8a96] text-[9px]">승률</div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-xs font-bold ${
                          agent.kd >= 1 ? "text-green-400" : "text-[#ff4655]"
                        }`}
                      >
                        {agent.kd}
                      </div>
                      <div className="text-[#7b8a96] text-[9px]">KD</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-white">{agent.damagePerRound}</div>
                      <div className="text-[#7b8a96] text-[9px]">DPR</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {seasons.length > 0 && (
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">시즌별 랭크 기록</div>
          <div className="flex flex-col gap-0">
            {seasons.map((season, index) => (
              <div
                key={season.season}
                className={`flex items-center gap-4 py-2.5 ${
                  index < seasons.length - 1 ? "border-b border-[#2a3540]" : ""
                }`}
              >
                <div className="w-36 flex-shrink-0">
                  {season.rankName ? (
                    <span className={`text-sm font-bold ${tierColor(season.tier)}`}>
                      {normalizeTierName(season.rankName, season.tier)}
                    </span>
                  ) : (
                    <span className="text-[#7b8a96] text-sm">언랭크</span>
                  )}
                </div>
                <div className="text-[#7b8a96] text-xs flex-1">{season.label}</div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-[#7b8a96] text-xs hidden sm:block">{season.matchesPlayed}경기</div>
                  <div className="text-right w-12">
                    <div
                      className={`text-sm font-bold ${
                        season.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"
                      }`}
                    >
                      {season.winRate}%
                    </div>
                    <div className="text-[#7b8a96] text-[10px]">승률</div>
                  </div>
                  <div className="text-right w-8">
                    <div className="text-sm font-bold text-white">{season.wins}</div>
                    <div className="text-[#7b8a96] text-[10px]">승</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
