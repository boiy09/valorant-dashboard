"use client";

import { useEffect, useState } from "react";

export default function ScrimPage() {
  const [scrims, setScrims] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/scrim")
      .then((response) => response.json())
      .then((data) => setScrims(data.sessions ?? []));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">내전</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          Discord에서 <code className="bg-[#111c24] px-1 rounded">/내전 시작</code>으로 내전 기록을 남길 수 있습니다.
        </p>
      </div>

      {scrims.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">아직 내전 기록이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {scrims.map((scrim) => {
            const teamA = scrim.players?.filter((player: any) => player.team === "team_a") ?? [];
            const teamB = scrim.players?.filter((player: any) => player.team === "team_b") ?? [];
            const winnerLabel =
              scrim.winnerId === "team_a"
                ? "팀 A 승리"
                : scrim.winnerId === "team_b"
                  ? "팀 B 승리"
                  : scrim.winnerId === "draw"
                    ? "무승부"
                    : null;

            return (
              <div key={scrim.id} className="val-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-white font-bold">{scrim.title}</span>
                    {scrim.map && <span className="text-[#7b8a96] text-sm ml-2">{scrim.map}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {winnerLabel && (
                      <span className="text-xs font-bold px-3 py-1 bg-[#ff4655]/10 text-[#ff4655] rounded">
                        {winnerLabel}
                      </span>
                    )}
                    <span className="text-[#7b8a96] text-xs">
                      {new Date(scrim.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "팀 A", color: "text-red-400", players: teamA },
                    { label: "팀 B", color: "text-blue-400", players: teamB },
                  ].map(({ label, color, players }) => (
                    <div key={label} className="bg-[#111c24] rounded-lg p-3">
                      <div className={`text-xs font-bold ${color} mb-2`}>{label}</div>
                      {players.length === 0 ? (
                        <div className="text-[#7b8a96] text-xs">-</div>
                      ) : (
                        players.map((player: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 py-0.5">
                            {player.user?.image && (
                              <img src={player.user.image} alt="" className="w-4 h-4 rounded-full" />
                            )}
                            <span className="text-white text-sm">{player.user?.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
