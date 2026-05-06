"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PlayerRow {
  puuid: string;
  name: string;
  tag: string;
  teamId: string;
  agent: string;
  agentIcon: string;
  tierName: string;
  tierId: number;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  plusMinus: number;
  kd: number;
  hsPercent: number;
  adr: number | null;
}

interface Team {
  teamId: string;
  roundsWon: number;
  won: boolean;
}

interface MatchDetail {
  matchId: string;
  map: string;
  mode: string;
  startedAt: string;
  gameLengthMs: number;
  totalRounds: number;
  players: PlayerRow[];
  teams: Team[];
}

function tierColor(tierId: number) {
  if (tierId >= 24) return "text-[#ff4655]";
  if (tierId >= 21) return "text-[#f0b429]";
  if (tierId >= 18) return "text-[#a855f7]";
  if (tierId >= 15) return "text-[#3b82f6]";
  if (tierId >= 12) return "text-[#4ade80]";
  if (tierId >= 9) return "text-orange-400";
  if (tierId >= 6) return "text-amber-600";
  if (tierId >= 3) return "text-zinc-400";
  return "text-[#7b8a96]";
}

function fmtDuration(ms: number) {
  if (!ms) return "--";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function fmtDate(iso: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PlayerTable({
  players,
  myPuuid,
  teamColor,
}: {
  players: PlayerRow[];
  myPuuid: string;
  teamColor: string;
}) {
  const sorted = [...players].sort((a, b) => b.acs - a.acs);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-[#7b8a96] border-b border-[#2a3540]">
            <th className="text-left py-2 pl-3 font-medium w-48">플레이어</th>
            <th className="text-right py-2 px-2 font-medium">ACS</th>
            <th className="text-right py-2 px-2 font-medium">K</th>
            <th className="text-right py-2 px-2 font-medium">D</th>
            <th className="text-right py-2 px-2 font-medium">A</th>
            <th className="text-right py-2 px-2 font-medium">+/-</th>
            <th className="text-right py-2 px-2 font-medium">K/D</th>
            <th className="text-right py-2 px-2 font-medium">HS%</th>
            <th className="text-right py-2 pr-3 font-medium">ADR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((player) => {
            const isMe = player.puuid === myPuuid;
            return (
              <tr
                key={player.puuid}
                className={`border-b border-[#1a242d] last:border-0 ${
                  isMe ? "bg-[#ff4655]/5" : "hover:bg-white/[0.02]"
                }`}
              >
                {/* 플레이어 */}
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    {player.agentIcon ? (
                      <img
                        src={player.agentIcon}
                        alt={player.agent}
                        className="w-7 h-7 rounded flex-shrink-0 object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[#2a3540] flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`font-bold truncate ${isMe ? "text-[#ff4655]" : "text-white"}`}>
                          {player.name}
                        </span>
                        <span className="text-[#4a5a68]">#{player.tag}</span>
                        {isMe && (
                          <span className="text-[9px] text-[#ff4655] bg-[#ff4655]/10 px-1 rounded flex-shrink-0">
                            나
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] ${tierColor(player.tierId)}`}>
                        {player.tierName}
                      </div>
                    </div>
                  </div>
                </td>
                {/* ACS */}
                <td className="text-right py-2 px-2 font-bold text-white">{player.acs}</td>
                {/* K */}
                <td className="text-right py-2 px-2 font-bold text-white">{player.kills}</td>
                {/* D */}
                <td className="text-right py-2 px-2 font-bold text-[#ff4655]">{player.deaths}</td>
                {/* A */}
                <td className="text-right py-2 px-2 text-white">{player.assists}</td>
                {/* +/- */}
                <td
                  className={`text-right py-2 px-2 font-bold ${
                    player.plusMinus > 0
                      ? "text-green-400"
                      : player.plusMinus < 0
                        ? "text-[#ff4655]"
                        : "text-[#7b8a96]"
                  }`}
                >
                  {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}
                </td>
                {/* K/D */}
                <td
                  className={`text-right py-2 px-2 font-bold ${
                    player.kd >= 1 ? "text-green-400" : "text-[#ff4655]"
                  }`}
                >
                  {player.kd.toFixed(2)}
                </td>
                {/* HS% */}
                <td
                  className={`text-right py-2 px-2 ${
                    player.hsPercent >= 25 ? "text-green-400" : "text-white"
                  }`}
                >
                  {player.hsPercent}%
                </td>
                {/* ADR */}
                <td className="text-right py-2 pr-3 text-white">
                  {player.adr !== null ? player.adr : "--"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchScoreboard({
  matchId,
  myPuuid,
  result,
}: {
  matchId: string;
  myPuuid: string;
  result: "승리" | "패배" | "무효";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    fetch(`/api/valorant/match/${matchId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("매치 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [open, data, loading, matchId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const myTeamId = data?.players.find((p) => p.puuid === myPuuid)?.teamId;
  const teamA = data?.teams.find((t) => t.teamId === myTeamId);
  const teamB = data?.teams.find((t) => t.teamId !== myTeamId);
  const myTeamPlayers = data?.players.filter((p) => p.teamId === myTeamId) ?? [];
  const enemyTeamPlayers = data?.players.filter((p) => p.teamId !== myTeamId) ?? [];

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#7b8a96] hover:text-white border border-[#2a3540] hover:border-[#ff4655] px-3 py-1.5 rounded transition-colors"
      >
        <span>📊</span>
        <span>전체 스코어보드</span>
      </button>

      {open && mounted && createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={(e) => { if (e.target === overlayRef.current) setOpen(false); }}
        >
          <div className="bg-[#111c24] border border-[#2a3540] rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a3540] flex-shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[#ff4655] text-[10px] tracking-widest uppercase">
                    {data?.mode ?? "매치"}
                  </div>
                  <div className="text-white font-black text-lg">{data?.map ?? "..."}</div>
                </div>
                {data && (
                  <>
                    <div className="flex items-center gap-2 text-2xl font-black">
                      <span className={teamA?.won ? "text-green-400" : "text-[#ff4655]"}>
                        {teamA?.roundsWon ?? 0}
                      </span>
                      <span className="text-[#2a3540]">:</span>
                      <span className={teamB?.won ? "text-green-400" : "text-[#ff4655]"}>
                        {teamB?.roundsWon ?? 0}
                      </span>
                    </div>
                    <div className="text-[#7b8a96] text-xs space-y-0.5">
                      <div>{fmtDate(data.startedAt)}</div>
                      <div>{fmtDuration(data.gameLengthMs)}</div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#7b8a96] hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="flex items-center justify-center gap-3 py-16 text-[#7b8a96]">
                  <div className="w-4 h-4 border-2 border-[#ff4655] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">스코어보드 불러오는 중...</span>
                </div>
              )}

              {error && (
                <div className="px-5 py-8 text-center text-[#ff4655] text-sm">{error}</div>
              )}

              {data && !loading && (
                <div>
                  {/* 내 팀 */}
                  <div className="px-5 pt-4 pb-1">
                    <div className={`text-xs font-bold tracking-widest uppercase mb-2 ${
                      result === "승리" ? "text-green-400" : result === "패배" ? "text-[#ff4655]" : "text-[#7b8a96]"
                    }`}>
                      {result === "승리" ? "승리 팀 (내 팀)" : result === "패배" ? "패배 팀 (내 팀)" : "내 팀"} · {teamA?.roundsWon}라운드
                    </div>
                  </div>
                  <PlayerTable players={myTeamPlayers} myPuuid={myPuuid} teamColor={result === "승리" ? "green" : "red"} />

                  {/* 구분선 */}
                  <div className="mx-5 my-2 border-t-2 border-[#2a3540]" />

                  {/* 상대 팀 */}
                  <div className="px-5 pt-1 pb-1">
                    <div className={`text-xs font-bold tracking-widest uppercase mb-2 ${
                      result === "패배" ? "text-green-400" : result === "승리" ? "text-[#ff4655]" : "text-[#7b8a96]"
                    }`}>
                      {result === "패배" ? "승리 팀 (상대)" : result === "승리" ? "패배 팀 (상대)" : "상대 팀"} · {teamB?.roundsWon}라운드
                    </div>
                  </div>
                  <PlayerTable players={enemyTeamPlayers} myPuuid={myPuuid} teamColor={result === "패배" ? "green" : "red"} />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
