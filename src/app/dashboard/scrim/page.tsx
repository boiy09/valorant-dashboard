"use client";

import { useState, useEffect } from "react";

export default function ScrimPage() {
  const [scrims, setScrims] = useState<any[]>([]);
  const [elo, setElo] = useState<any[]>([]);
  const [view, setView] = useState<"history" | "elo">("history");

  useEffect(() => {
    fetch("/api/scrim").then(r => r.json()).then(d => setScrims(d.sessions ?? []));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">내전 / 큐</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">내전 기록, ELO 랭킹 — Discord에서 <code className="bg-[#111c24] px-1 rounded">/큐 참가</code> 또는 <code className="bg-[#111c24] px-1 rounded">/내전 시작</code></p>
      </div>

      <div className="flex gap-2 mb-6">
        {([["history", "내전 기록"], ["elo", "ELO 랭킹"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`val-btn px-5 py-2 text-sm font-medium ${view === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "history" && (
        scrims.length === 0
          ? <div className="val-card p-12 text-center text-[#7b8a96]">아직 내전 기록이 없어요</div>
          : <div className="flex flex-col gap-3">
              {scrims.map(s => {
                const teamA = s.players?.filter((p: any) => p.team === "team_a") ?? [];
                const teamB = s.players?.filter((p: any) => p.team === "team_b") ?? [];
                const winnerLabel = s.winnerId === "team_a" ? "🔴 팀 A 승" : s.winnerId === "team_b" ? "🔵 팀 B 승" : s.winnerId === "draw" ? "🤝 무승부" : null;
                return (
                  <div key={s.id} className="val-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-white font-bold">{s.title}</span>
                        {s.map && <span className="text-[#7b8a96] text-sm ml-2">{s.map}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {winnerLabel && (
                          <span className="text-xs font-bold px-3 py-1 bg-[#ff4655]/10 text-[#ff4655] rounded">{winnerLabel}</span>
                        )}
                        <span className="text-[#7b8a96] text-xs">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ label: "🔴 팀 A", color: "text-red-400", players: teamA }, { label: "🔵 팀 B", color: "text-blue-400", players: teamB }].map(({ label, color, players }) => (
                        <div key={label} className="bg-[#111c24] rounded-lg p-3">
                          <div className={`text-xs font-bold ${color} mb-2`}>{label}</div>
                          {players.length === 0
                            ? <div className="text-[#7b8a96] text-xs">-</div>
                            : players.map((p: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 py-0.5">
                                  {p.user?.image && <img src={p.user.image} alt="" className="w-4 h-4 rounded-full" />}
                                  <span className="text-white text-sm">{p.user?.name}</span>
                                </div>
                              ))
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {view === "elo" && (
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">내전 ELO 랭킹</div>
          <div className="text-center text-[#7b8a96] py-8">
            Discord에서 <code className="bg-[#111c24] px-1 rounded">/큐 랭킹</code> 으로 ELO 확인하세요
          </div>
        </div>
      )}
    </div>
  );
}
