"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";

interface RankingItem {
  userId: string;
  name: string;
  image: string | null;
  kills: number;
  deaths: number;
  assists: number;
  gamesPlayed: number;
  tier: string;
  kd: number;
  rank: number;
}

export default function ScrimRankingPage() {
  const { data: session } = useSession();
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [myRank, setMyRank] = useState<RankingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>("");

  const tiers = ["아이언", "브론즈", "실버", "골드", "플래티넘", "다이아몬드", "초월자", "불멸", "레디언트"];

  useEffect(() => {
    async function fetchRanking() {
      setLoading(true);
      try {
        const url = new URL("/api/scrim/ranking", window.location.origin);
        if (tierFilter) url.searchParams.set("tier", tierFilter);
        
        const res = await fetch(url.toString());
        const data = await res.json();
        setRanking(data.ranking || []);
        setMyRank(data.myRank || null);
      } catch (e) {
        console.error("Failed to fetch ranking", e);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [tierFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-[#ff4655] animate-pulse font-black">RANKING LOADING...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 및 필터 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">Scrim Leaderboard</h1>
          <p className="text-sm text-[#7b8a96]">내전 모든 경기의 K/D 기반 랭킹입니다.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#7b8a96] uppercase">Tier Filter:</span>
          <select 
            value={tierFilter} 
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded border border-[#2a3540] bg-[#0f1923] px-3 py-1.5 text-xs font-bold text-[#ece8e1] outline-none focus:border-[#ff4655]/50"
          >
            <option value="">전체 티어</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* 내 순위 고정 표시 */}
      {myRank && (
        <div className="val-card border-l-4 border-l-[#ff4655] bg-[#ff4655]/5 p-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#ff4655]">My Standing</div>
          <RankingRow item={myRank} isMe={true} />
        </div>
      )}

      {/* 랭킹 리스트 */}
      <div className="val-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1d2732] text-[11px] font-black uppercase tracking-wider text-[#7b8a96]">
              <tr>
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4">Tier</th>
                <th className="px-6 py-4 text-center">Games</th>
                <th className="px-6 py-4 text-center">K/D</th>
                <th className="px-6 py-4 text-right">K / D / A</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3540]/50">
              {ranking.map((item) => (
                <tr key={item.userId} className={`transition-colors hover:bg-white/[0.02] ${item.userId === session?.user?.id ? 'bg-[#ff4655]/5' : ''}`}>
                  <td className="px-6 py-4">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                      item.rank === 1 ? 'bg-[#ff4655] text-white' : 
                      item.rank === 2 ? 'bg-[#ece8e1] text-[#0f1923]' :
                      item.rank === 3 ? 'bg-[#c49b66] text-white' : 'text-[#7b8a96]'
                    }`}>
                      {item.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {item.image ? (
                        <img src={item.image} alt="" className="h-8 w-8 rounded-full border border-[#2a3540] object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3540] text-xs font-bold text-[#7b8a96]">
                          {item.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-bold text-[#ece8e1]">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-[#9aa8b3]">{item.tier}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-[#ece8e1]">{item.gamesPlayed}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-base font-black ${item.kd >= 1.2 ? 'text-[#00ffcc]' : item.kd >= 1.0 ? 'text-[#ece8e1]' : 'text-[#7b8a96]'}`}>
                      {item.kd.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs text-[#7b8a96]">
                    <span className="text-[#ece8e1]">{item.kills}</span> / {item.deaths} / {item.assists}
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#7b8a96]">
                    표시할 랭킹 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RankingRow({ item, isMe }: { item: RankingItem; isMe: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className="text-2xl font-black italic text-[#ff4655]">#{item.rank}</span>
        <div className="flex items-center gap-3">
          {item.image ? (
            <img src={item.image} alt="" className="h-10 w-10 rounded-full border-2 border-[#ff4655]/30 object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2a3540] text-sm font-bold text-[#7b8a96]">
              {item.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="text-sm font-black text-white">{item.name} {isMe && <span className="ml-1 text-[10px] text-[#ff4655]">(ME)</span>}</div>
            <div className="text-[10px] font-bold text-[#7b8a96]">{item.tier} · {item.gamesPlayed} Games</div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="text-center">
          <div className="text-[10px] font-black uppercase text-[#7b8a96]">K/D Ratio</div>
          <div className="text-xl font-black text-[#00ffcc]">{item.kd.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase text-[#7b8a96]">K / D / A</div>
          <div className="font-mono text-sm text-[#ece8e1]">{item.kills} / {item.deaths} / {item.assists}</div>
        </div>
      </div>
    </div>
  );
}
