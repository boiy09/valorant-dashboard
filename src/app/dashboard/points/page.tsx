"use client";

import { useState, useEffect } from "react";

interface PointEntry {
  rank: number;
  user: { name: string | null; image: string | null } | null;
  points: number;
}

interface HistoryEntry {
  amount: number;
  reason: string;
  createdAt: string;
}

export default function PointsPage() {
  const [view, setView] = useState<"ranking" | "me">("ranking");
  const [ranking, setRanking] = useState<PointEntry[]>([]);
  const [myTotal, setMyTotal] = useState<number | null>(null);
  const [myHistory, setMyHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/points?type=ranking")
      .then(r => r.json())
      .then(d => setRanking(d.ranking ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view === "me" && myTotal === null) {
      fetch("/api/points?type=me")
        .then(r => r.json())
        .then(d => {
          setMyTotal(d.total ?? 0);
          setMyHistory(d.history ?? []);
        })
        .catch(() => {});
    }
  }, [view]);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">포인트</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">음성 활동, 내전 참여, 출석 등으로 포인트를 쌓아요</p>
      </div>

      <div className="flex gap-2 mb-6">
        {([["ranking", "전체 랭킹"], ["me", "내 포인트"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`val-btn px-5 py-2 text-sm font-medium ${view === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "ranking" && (
        loading ? (
          <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
        ) : ranking.length === 0 ? (
          <div className="val-card p-12 text-center text-[#7b8a96]">포인트 기록이 없어요</div>
        ) : (
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">포인트 랭킹</div>
            <div className="flex flex-col gap-2">
              {ranking.map(r => (
                <div key={r.rank} className={`flex items-center gap-3 py-2 ${r.rank <= 3 ? "stat-highlight px-3 rounded" : ""}`}>
                  <span className={`text-sm font-black w-6 text-center ${r.rank === 1 ? "text-yellow-400" : r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-[#7b8a96]"}`}>
                    {r.rank}
                  </span>
                  {r.user?.image
                    ? <img src={r.user.image} alt={r.user.name ?? ""} className="w-8 h-8 rounded-full" />
                    : <div className="w-8 h-8 rounded-full bg-[#2a3540] flex items-center justify-center text-xs text-[#7b8a96]">{r.user?.name?.[0]}</div>
                  }
                  <span className="flex-1 text-white font-medium truncate">{r.user?.name}</span>
                  <div className="text-right">
                    <span className="text-[#ff4655] font-black text-lg">{r.points.toLocaleString()}</span>
                    <span className="text-[#7b8a96] text-xs ml-1">P</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {view === "me" && (
        myTotal === null ? (
          <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="val-card p-6 flex flex-col items-center justify-center">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">내 포인트</div>
              <div className="text-[#ff4655] font-black text-5xl">{myTotal.toLocaleString()}</div>
              <div className="text-[#7b8a96] text-sm mt-1">포인트</div>
            </div>
            <div className="lg:col-span-2 val-card p-5">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">최근 내역</div>
              {myHistory.length === 0 ? (
                <div className="text-[#7b8a96] text-sm text-center py-4">내역이 없어요</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {myHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#2a3540] last:border-0">
                      <div>
                        <div className="text-white text-sm">{h.reason}</div>
                        <div className="text-[#7b8a96] text-xs mt-0.5">
                          {new Date(h.createdAt).toLocaleDateString("ko-KR")}
                        </div>
                      </div>
                      <span className={`font-black text-lg ${h.amount > 0 ? "text-green-400" : "text-[#ff4655]"}`}>
                        {h.amount > 0 ? "+" : ""}{h.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
