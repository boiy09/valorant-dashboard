"use client";

import { useState, useEffect } from "react";

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
  stats: CareerStats;
  agents: AgentStat[];
  seasons: SeasonStat[];
  rateLimit?: RateLimit;
}

interface Props {
  gameName: string;
  tagLine: string;
}

function tierColor(tier: number) {
  if (tier >= 24) return "text-[#ff4655]";   // Radiant
  if (tier >= 21) return "text-[#f0b429]";   // Immortal
  if (tier >= 18) return "text-[#a855f7]";   // Diamond
  if (tier >= 15) return "text-[#3b82f6]";   // Platinum
  if (tier >= 12) return "text-[#4ade80]";   // Gold
  if (tier >= 9)  return "text-[#f97316]";   // Silver
  if (tier >= 6)  return "text-[#b45309]";   // Bronze
  if (tier >= 3)  return "text-[#6b7280]";   // Iron
  return "text-[#7b8a96]";
}

export default function TrackerStats({ gameName, tagLine }: Props) {
  const [data, setData] = useState<CareerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`/api/tracker?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setLoaded(true); }
      })
      .catch(() => setError("데이터를 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }

  if (!loaded && !loading && !error) {
    return (
      <div className="val-card p-4 flex items-center justify-between">
        <span className="text-[#7b8a96] text-sm">커리어 통계 (최근 20경기 기반)</span>
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
        <span className="text-[#7b8a96] text-sm">커리어 데이터 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="val-card p-4 flex items-center justify-between">
        <span className="text-[#ff4655] text-sm">{error}</span>
        <button onClick={load} className="text-xs text-[#7b8a96] hover:text-white px-3 py-1 border border-[#2a3540] rounded transition-colors">
          재시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { stats, agents, seasons, rateLimit } = data;

  function formatResetTime(secs: number) {
    if (!secs || secs <= 0) return null;
    if (secs < 60) return `${secs}초 후 초기화`;
    return `${Math.ceil(secs / 60)}분 후 초기화`;
  }

  const statItems = [
    { label: "최근 경기 수",    value: `${stats.matchesPlayed}경기`,  color: "" },
    { label: "승률",            value: `${stats.winRate}%`,           color: stats.winRate >= 50 ? "text-green-400" : "text-[#ff4655]" },
    { label: "KD 비율",         value: stats.kd.toString(),           color: stats.kd >= 1 ? "text-green-400" : "text-[#ff4655]" },
    { label: "헤드샷율",        value: `${stats.headshotPct}%`,       color: stats.headshotPct >= 20 ? "text-green-400" : "" },
    { label: "라운드당 킬",     value: stats.killsPerRound.toString(), color: "" },
    { label: "라운드당 점수",   value: stats.scorePerRound.toString(), color: "" },
    { label: "라운드당 딜",     value: stats.damagePerRound.toString(), color: stats.damagePerRound >= 150 ? "text-green-400" : "" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 최근 20경기 요약 */}
      <div className="val-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase">최근 20경기 통계</div>
          <div className="flex items-center gap-3">
            {rateLimit && rateLimit.limit > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className={`font-bold ${rateLimit.remaining <= 5 ? "text-[#ff4655]" : rateLimit.remaining <= 15 ? "text-yellow-400" : "text-green-400"}`}>
                  {rateLimit.remaining}/{rateLimit.limit}
                </span>
                <span className="text-[#4a5a68]">요청</span>
                {formatResetTime(rateLimit.resetInSecs) && (
                  <span className="text-[#4a5a68]">· {formatResetTime(rateLimit.resetInSecs)}</span>
                )}
              </div>
            )}
            <a
              href={`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${gameName}#${tagLine}`)}/overview`}
              target="_blank" rel="noopener noreferrer"
              className="text-[#7b8a96] text-xs hover:text-[#ff4655] transition-colors"
            >
              tracker.gg →
            </a>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {statItems.map(s => (
            <div key={s.label} className="bg-[#111c24] rounded-lg p-3 text-center">
              <div className={`font-black text-base ${s.color || "text-white"}`}>{s.value}</div>
              <div className="text-[#7b8a96] text-[10px] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 에이전트별 통계 */}
      {agents.length > 0 && (
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">에이전트별 통계</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.slice(0, 9).map(a => (
              <div key={a.name} className="bg-[#111c24] rounded-lg p-3 flex items-center gap-3">
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-[#2a3540] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-bold truncate">{a.name}</div>
                  <div className="text-[#7b8a96] text-xs">{a.matchesPlayed}판</div>
                  <div className="grid grid-cols-3 gap-1 mt-1.5">
                    <div className="text-center">
                      <div className={`text-xs font-bold ${a.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{a.winRate}%</div>
                      <div className="text-[#7b8a96] text-[9px]">승률</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-bold ${a.kd >= 1 ? "text-green-400" : "text-[#ff4655]"}`}>{a.kd}</div>
                      <div className="text-[#7b8a96] text-[9px]">KD</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-white">{a.damagePerRound}</div>
                      <div className="text-[#7b8a96] text-[9px]">DPR</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 시즌별 랭크 기록 */}
      {seasons.length > 0 && (
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">시즌별 랭크 기록</div>
          <div className="flex flex-col gap-0">
            {seasons.map((s, i) => (
              <div key={s.season} className={`flex items-center gap-4 py-2.5 ${i < seasons.length - 1 ? "border-b border-[#2a3540]" : ""}`}>
                <div className="w-36 flex-shrink-0">
                  {s.rankName ? (
                    <span className={`text-sm font-bold ${tierColor(s.tier)}`}>{s.rankName}</span>
                  ) : (
                    <span className="text-[#7b8a96] text-sm">언랭크</span>
                  )}
                </div>
                <div className="text-[#7b8a96] text-xs flex-1">{s.label}</div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-[#7b8a96] text-xs hidden sm:block">{s.matchesPlayed}판</div>
                  <div className="text-right w-12">
                    <div className={`text-sm font-bold ${s.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{s.winRate}%</div>
                    <div className="text-[#7b8a96] text-[10px]">승률</div>
                  </div>
                  <div className="text-right w-8">
                    <div className="text-sm font-bold text-white">{s.wins}</div>
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
