"use client";

import { useState } from "react";
import { normalizeTierName } from "@/lib/tierName";
import TrackerStats from "../TrackerStats";

type RiotRegion = "KR" | "AP";

interface PlayerResult {
  gameName: string;
  tagLine: string;
  region: RiotRegion;
  rank: {
    tierName: string;
    rr: number;
    rankIcon: string | null;
    wins: number;
    games: number;
  } | null;
  matches: {
    result: string;
    agent: string;
    map: string;
    kills: number;
    deaths: number;
    assists: number;
    agentIcon: string | null;
    playedAt: string;
  }[];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RiotRegion>("KR");
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}&region=${region}`
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "검색에 실패했습니다.");
      } else {
        setResult(data);
      }
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">전적 검색</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          라이엇 ID와 지역을 선택해서 다른 플레이어 전적을 조회합니다.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-8">
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as RiotRegion)}
          className="val-input w-full sm:w-36 px-4 py-3 text-white bg-[#1a242d] border border-[#2a3540] rounded focus:outline-none text-sm"
        >
          <option value="KR">KR · 한섭</option>
          <option value="AP">AP · 아섭</option>
        </select>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름#태그 (예: Player#KR1)"
          className="val-input flex-1 px-4 py-3 text-white placeholder-[#4a5a68] bg-[#1a242d] border border-[#2a3540] rounded focus:outline-none text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="val-btn px-6 py-3 bg-[#ff4655] text-white font-bold text-sm disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </form>

      {error && (
        <div className="val-card p-5 border border-[#ff4655]/30 text-[#ff4655] text-sm">{error}</div>
      )}

      {result && (
        <div>
          <div className="val-card p-5 mb-4">
            <div className="flex items-center gap-5">
              {result.rank?.rankIcon && (
                <img src={result.rank.rankIcon} alt={result.rank.tierName} className="w-16 h-16 drop-shadow-lg" />
              )}
              <div className="flex-1">
                <div className="text-2xl font-black text-white">
                  {result.gameName}
                  <span className="text-[#7b8a96] font-normal text-lg">#{result.tagLine}</span>
                </div>
                <div className="text-[#7b8a96] text-sm mt-1">
                  조회 지역: {result.region === "KR" ? "한섭(KR)" : "아섭(AP)"}
                </div>
                {result.rank ? (
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className="text-white font-bold">{normalizeTierName(result.rank.tierName)}</span>
                    <span className="text-[#ff4655] font-bold">{result.rank.rr} RR</span>
                    <span className="text-[#7b8a96] text-sm">
                      {result.rank.wins}승 / {Math.max(result.rank.games - result.rank.wins, 0)}패
                    </span>
                  </div>
                ) : (
                  <div className="text-[#7b8a96] text-sm mt-1">랭크 정보가 없습니다.</div>
                )}
              </div>
            </div>
          </div>

          {result.matches.length > 0 && (
            <div>
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 매치</div>
              <div className="flex flex-col gap-2">
                {result.matches.map((match, index) => {
                  const kd =
                    match.deaths > 0 ? (match.kills / match.deaths).toFixed(2) : match.kills.toFixed(2);

                  return (
                    <div
                      key={index}
                      className="val-card px-5 py-3 flex items-center gap-4"
                      style={{
                        borderLeftWidth: 3,
                        borderLeftStyle: "solid",
                        borderLeftColor:
                          match.result === "승리"
                            ? "#4ade80"
                            : match.result === "패배"
                              ? "#ff4655"
                              : "#52525b",
                      }}
                    >
                      {match.agentIcon ? (
                        <img
                          src={match.agentIcon}
                          alt={match.agent}
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[#111c24] flex-shrink-0" />
                      )}
                      <div className="flex-shrink-0 w-14">
                        <div
                          className={`font-black text-sm ${
                            match.result === "승리"
                              ? "text-green-400"
                              : match.result === "패배"
                                ? "text-[#ff4655]"
                                : "text-zinc-400"
                          }`}
                        >
                          {match.result}
                        </div>
                        <div className="text-[#7b8a96] text-xs">{match.agent}</div>
                      </div>
                      <div className="hidden sm:block text-[#7b8a96] text-sm w-16 flex-shrink-0">{match.map}</div>
                      <div className="flex-1">
                        <span className="text-white font-bold">{match.kills}</span>
                        <span className="text-[#7b8a96] text-sm"> / </span>
                        <span className="text-[#ff4655] font-bold">{match.deaths}</span>
                        <span className="text-[#7b8a96] text-sm"> / </span>
                        <span className="text-white font-bold">{match.assists}</span>
                        <span className="text-[#7b8a96] text-xs ml-2">KD {kd}</span>
                      </div>
                      <div className="text-[#7b8a96] text-xs flex-shrink-0">
                        {new Date(match.playedAt).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3 flex items-center gap-2">
              <span>상세 전적 통계</span>
              <span className="text-[#ff4655] text-[10px] bg-[#ff4655]/10 px-1.5 py-0.5 rounded">
                최근 20경기
              </span>
            </div>
            <TrackerStats gameName={result.gameName} tagLine={result.tagLine} region={result.region} />
          </div>
        </div>
      )}
    </div>
  );
}
