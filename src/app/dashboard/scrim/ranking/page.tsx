"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface KdRankingPlayer {
  userId: string;
  name: string | null;
  image: string | null;
  kills: number;
  deaths: number;
  assists: number;
  matches: number;
  kd: number;
  tierName: string;
  tierIconUrl: string | null;
  rank: number;
  region?: string;
  regionLabel?: string;
}

export default function ScrimRankingPage() {
  const [kdRanking, setKdRanking] = useState<KdRankingPlayer[]>([]);
  const [myRank, setMyRank] = useState<KdRankingPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRanking() {
      setLoading(true);
      const query = selectedTier ? `?tier=${selectedTier}` : "";
      const response = await fetch(`/api/scrim/ranking${query}`, { cache: "no-store" });
      const data = await response.json();
      setKdRanking(data.ranking);
      setMyRank(data.myRank);
      setLoading(false);
    }
    fetchRanking();
  }, [selectedTier]);

  const tiers = [
    "아이언", "브론즈", "실버", "골드", "플래티넘", "다이아몬드",
    "초월자", "불멸", "레디언트", "언랭크"
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
            VALORANT DASHBOARD
          </div>
          <h1 className="text-2xl font-black text-white">내전 KD 랭킹</h1>
          <p className="mt-0.5 text-sm text-[#7b8a96]">
            기록된 내전 매치의 킬/데스 기준 랭킹입니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/scrim" className="val-btn border border-[#2a3540] bg-[#0f1923] px-4 py-2 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white">
            내전 목록
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#7b8a96]">KD 랭킹보드</h2>
            <select
              value={selectedTier || "all"}
              onChange={(e) => setSelectedTier(e.target.value === "all" ? null : e.target.value)}
              className="rounded border border-[#2a3540] bg-[#0b141c] px-3 py-1 text-xs font-bold text-white outline-none transition-colors focus:border-[#ff4655]"
            >
              <option value="all">모든 티어</option>
              {tiers.map(tier => (
                <option key={tier} value={tier}>{tier}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 내 순위 통합 표시 */}
              {myRank && !kdRanking.find(p => p.userId === myRank.userId) && (
                <>
                  <div className="flex items-center gap-3 rounded border border-[#ff4655] bg-[#ff4655]/10 px-3 py-2 mb-2">
                    <span className="w-6 text-center text-sm font-black text-white">{myRank.rank}</span>
                    {myRank.image ? (
                      <img src={myRank.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-[#24313c]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-black text-white">{myRank.name ?? "이름 없음"}</div>
                        <span className="rounded bg-[#ff4655] px-1.5 py-0.5 text-[9px] font-black text-white uppercase">MY</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-[#c8d3db]">
                        {myRank.tierIconUrl && (
                          <img src={myRank.tierIconUrl} alt={myRank.tierName} className="h-4 w-4" />
                        )}
                        <span>{myRank.tierName}</span>
                        {myRank.regionLabel && (
                          <span className="ml-1 rounded bg-[#ff4655]/20 px-1.5 py-0.5 text-[10px] font-bold">{myRank.regionLabel}</span>
                        )}
                        <span className="ml-2 text-[#7b8a96]">{myRank.matches}경기</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{myRank.kd.toFixed(2)}</div>
                      <div className="text-[10px] text-[#c8d3db]">KD</div>
                    </div>
                  </div>
                  <div className="h-px bg-[#2a3540] my-2" />
                </>
              )}

              {kdRanking.length === 0 ? (
                <div className="val-card p-12 text-center text-[#7b8a96]">랭킹 기록이 없습니다.</div>
              ) : (
                kdRanking.map((player, index) => {
                  const isTop3 = index < 3;
                  const isMe = myRank?.userId === player.userId;
                  const rankClass = isTop3
                    ? index === 0
                      ? "bg-gradient-to-r from-yellow-500 to-yellow-300 text-black shadow-lg shadow-yellow-500/30"
                      : index === 1
                      ? "bg-gradient-to-r from-gray-400 to-gray-200 text-black shadow-lg shadow-gray-400/30"
                      : "bg-gradient-to-r from-amber-700 to-amber-500 text-black shadow-lg shadow-amber-700/30"
                    : isMe 
                      ? "border border-[#ff4655] bg-[#ff4655]/10 text-white"
                      : "border border-[#2a3540] bg-[#0f1923]/70 text-white";

                  const subTextColor = isTop3 ? "text-black/60" : "text-[#7b8a96]";
                  const mainTextColor = isTop3 ? "text-black" : "text-white";

                  return (
                    <div
                      key={player.userId}
                      className={`flex items-center gap-3 rounded px-3 py-2 ${rankClass}`}
                    >
                      <span className="w-6 text-center text-sm font-black">{player.rank}</span>
                      {player.image ? (
                        <img src={player.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-[#24313c]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`truncate text-sm font-black ${mainTextColor}`}>{player.name ?? "이름 없음"}</div>
                          {isMe && !isTop3 && <span className="rounded bg-[#ff4655] px-1.5 py-0.5 text-[9px] font-black text-white uppercase">MY</span>}
                        </div>
                        <div className={`flex items-center gap-1 text-[11px] ${subTextColor}`}>
                          {player.tierIconUrl && (
                            <img src={player.tierIconUrl} alt={player.tierName} className="h-4 w-4" />
                          )}
                          <span>{player.tierName}</span>
                          {player.regionLabel && (
                            <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${isTop3 ? 'bg-black/10' : 'bg-[#2a3540]'}`}>{player.regionLabel}</span>
                          )}
                          <span className="ml-2">{player.matches}경기</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-black ${mainTextColor}`}>{player.kd.toFixed(2)}</div>
                        <div className={`text-[10px] ${subTextColor}`}>KD</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
