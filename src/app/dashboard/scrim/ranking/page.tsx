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
  gamesPlayed: number;
  kd: number;
  krTier: string;
  krTierIcon: string;
  apTier: string;
  apTierIcon: string;
  rank: number;
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

  const RankingRow = ({ player, index, isMe }: { player: KdRankingPlayer; index?: number; isMe?: boolean }) => {
    const isTop3 = index !== undefined && index < 3;
    const rankClass = isTop3
      ? index === 0
        ? "border-2 border-yellow-500/50 bg-yellow-500/10 text-white shadow-lg shadow-yellow-500/10"
        : index === 1
        ? "border-2 border-gray-400/50 bg-gray-400/10 text-white shadow-lg shadow-gray-400/10"
        : "border-2 border-amber-700/50 bg-amber-700/10 text-white shadow-lg shadow-amber-700/10"
      : isMe 
        ? "border border-[#ff4655] bg-[#ff4655]/10 text-white"
        : "border border-[#2a3540] bg-[#0f1923]/70 text-white";

    return (
      <div className={`flex items-center gap-4 rounded px-4 py-3 transition-all ${rankClass}`}>
        <div className="w-8 text-center text-sm font-black">
          {player.rank}
        </div>

        <div className="flex flex-1 items-center gap-3 min-w-0">
          {player.image ? (
            <img src={player.image} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-[#2a3540]" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-[#24313c] ring-1 ring-[#2a3540]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black text-white">{player.name ?? "이름 없음"}</span>
              {isMe && <span className="rounded bg-[#ff4655] px-1.5 py-0.5 text-[9px] font-black text-white uppercase">MY</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-[#7b8a96] uppercase">KR</span>
                <img src={player.krTierIcon} alt={player.krTier} className="h-4 w-4" />
                <span className="text-[11px] text-[#c8d3db]">{player.krTier}</span>
              </div>
              <div className="flex items-center gap-1 border-l border-[#2a3540] pl-3">
                <span className="text-[10px] font-bold text-[#7b8a96] uppercase">AP</span>
                <img src={player.apTierIcon} alt={player.apTier} className="h-4 w-4" />
                <span className="text-[11px] text-[#c8d3db]">{player.apTier}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-8 text-right">
          <div className="w-16">
            <div className="text-sm font-black text-white">{player.gamesPlayed}</div>
            <div className="text-[10px] text-[#7b8a96] uppercase">Matches</div>
          </div>
          <div className="w-20">
            <div className="text-sm font-black text-white">{player.kills}/{player.deaths}</div>
            <div className="text-[10px] text-[#7b8a96] uppercase">K/D Stat</div>
          </div>
          <div className="w-16">
            <div className="text-base font-black text-[#ff4655]">{player.kd.toFixed(2)}</div>
            <div className="text-[10px] text-[#7b8a96] uppercase font-bold">KD</div>
          </div>
        </div>

        <div className="sm:hidden text-right">
          <div className="text-base font-black text-[#ff4655]">{player.kd.toFixed(2)}</div>
          <div className="text-[10px] text-[#7b8a96] uppercase font-bold">KD</div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-80px)] bg-[#0b141c] flex flex-col overflow-hidden px-4 sm:px-6">
      {/* 헤더 섹션 (고정) */}
      <div className="flex-none py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.3em] text-[#ff4655]">
              Valorant Dashboard
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">KD RANKING BOARD</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard/scrim" className="val-btn border border-[#2a3540] bg-[#0f1923] px-5 py-2.5 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white transition-all">
              내전 목록으로 돌아가기
            </Link>
          </div>
        </div>

        {/* 내 순위 섹션 (고정) */}
        <div className="mx-auto max-w-4xl mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-1 bg-[#ff4655]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">MY STANDING</h2>
          </div>
          {loading ? (
            <div className="val-card p-6 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
            </div>
          ) : myRank ? (
            <RankingRow player={myRank} isMe={true} />
          ) : (
            <div className="val-card border-dashed border-[#2a3540] bg-[#0f1923]/30 p-6 text-center">
              <p className="text-sm font-bold text-[#7b8a96]">아직 내전 참여 기록이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 리더보드 섹션 (박스 내 스크롤) */}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-4xl flex flex-col mb-8">
        {/* 필터 및 컨트롤 (고정) */}
        <div className="flex-none mb-4 flex items-center justify-between gap-4 rounded-lg bg-[#0f1923] p-4 border border-[#2a3540]">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 bg-[#ff4655]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">리더보드</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-[#7b8a96] uppercase">Filter Tier:</span>
            <select
              value={selectedTier || "all"}
              onChange={(e) => setSelectedTier(e.target.value === "all" ? null : e.target.value)}
              className="rounded border border-[#2a3540] bg-[#0b141c] px-4 py-1.5 text-xs font-black text-white outline-none transition-all focus:border-[#ff4655] cursor-pointer"
            >
              <option value="all">모든 티어</option>
              {tiers.map(tier => (
                <option key={tier} value={tier}>{tier}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 데이터 헤더 (고정) */}
        <div className="flex-none mb-3 flex items-center gap-4 px-8 text-[10px] font-black uppercase tracking-widest text-[#7b8a96]">
          <div className="w-8 text-center">#</div>
          <div className="flex-1">Player / Region Tiers</div>
          <div className="hidden sm:flex items-center gap-8 text-right">
            <div className="w-16">Matches</div>
            <div className="w-20">K/D Ratio</div>
            <div className="w-16">KD</div>
          </div>
          <div className="sm:hidden">KD</div>
        </div>

        {/* 스크롤 가능한 리스트 영역 */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="val-card p-20 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
              <p className="text-sm font-bold text-[#7b8a96]">데이터를 불러오는 중입니다...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-4">
              {kdRanking.length === 0 ? (
                <div className="val-card p-20 text-center border-dashed border-[#2a3540]">
                  <p className="text-sm font-bold text-[#7b8a96]">등록된 랭킹 데이터가 없습니다.</p>
                </div>
              ) : (
                kdRanking.map((player, index) => (
                  <RankingRow 
                    key={player.userId} 
                    player={player} 
                    index={index} 
                    isMe={myRank?.userId === player.userId} 
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0b141c;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2a3540;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff4655;
        }
      `}</style>
    </div>
  );
}
