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
        {/* 순위 */}
        <div className="w-8 text-center text-sm font-black">
          {player.rank}
        </div>

        {/* 프로필 */}
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
            {/* 티어 정보 (한섭/아섭) */}
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

        {/* 데이터 섹션 */}
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

        {/* 모바일 대응 */}
        <div className="sm:hidden text-right">
          <div className="text-base font-black text-[#ff4655]">{player.kd.toFixed(2)}</div>
          <div className="text-[10px] text-[#7b8a96] uppercase font-bold">KD</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b141c] pb-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-black uppercase tracking-[0.3em] text-[#ff4655]">
            Valorant Dashboard
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">KD RANKING BOARD</h1>
          <p className="mt-1 text-sm text-[#7b8a96]">
            내전 기록 기반 실시간 KD 랭킹 시스템
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/scrim" className="val-btn border border-[#2a3540] bg-[#0f1923] px-5 py-2.5 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white transition-all">
            내전 목록으로 돌아가기
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-8">
        {/* 내 순위 섹션 (항상 표시) */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-4 w-1 bg-[#ff4655]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">MY STANDING</h2>
          </div>
          
          {loading ? (
            <div className="val-card p-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
            </div>
          ) : myRank ? (
            <RankingRow player={myRank} isMe={true} />
          ) : (
            <div className="val-card border-dashed border-[#2a3540] bg-[#0f1923]/30 p-8 text-center">
              <p className="text-sm font-bold text-[#7b8a96]">아직 내전 참여 기록이 없습니다.</p>
              <p className="mt-1 text-xs text-[#5a6a76]">내전에 참여하여 랭킹에 이름을 올려보세요!</p>
            </div>
          )}
        </section>

        {/* 전체 랭킹 섹션 */}
        <section>
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg bg-[#0f1923] p-4 border border-[#2a3540]">
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

          {/* 데이터 헤더 */}
          <div className="mb-3 flex items-center gap-4 px-8 text-[10px] font-black uppercase tracking-widest text-[#7b8a96]">
            <div className="w-8 text-center">#</div>
            <div className="flex-1">Player / Region Tiers</div>
            <div className="hidden sm:flex items-center gap-8 text-right">
              <div className="w-16">Matches</div>
              <div className="w-20">K/D Ratio</div>
              <div className="w-16">KD</div>
            </div>
            <div className="sm:hidden">KD</div>
          </div>

          {loading ? (
            <div className="val-card p-20 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
              <p className="text-sm font-bold text-[#7b8a96]">데이터를 불러오는 중입니다...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
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
        </section>
      </div>
    </div>
  );
}
