"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult, MatchScoreboardData, ScoreboardPlayer } from "@/lib/valorant";

interface MatchDetailPayload extends MatchScoreboardData {
  matchId: string;
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
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function fmtMatchDate(date: string) {
  if (!date) return "--";
  return new Date(date).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roundWinType(result: string, ceremony: string): "defuse" | "spike" | "time" | "surrender" | "elimination" {
  const text = `${result} ${ceremony}`.toLowerCase();
  if (text.includes("defus")) return "defuse";
  if (text.includes("deton") || text.includes("explode") || text.includes("spike") || text.includes("bomb")) return "spike";
  if (text.includes("time") || text.includes("timeout")) return "time";
  if (text.includes("surrender") || text.includes("forfeit")) return "surrender";
  return "elimination";
}

function roundWinLabel(type: ReturnType<typeof roundWinType>) {
  if (type === "defuse") return "스파이크 해체";
  if (type === "spike") return "스파이크 폭발";
  if (type === "time") return "시간 승리";
  if (type === "surrender") return "항복";
  return "전멸";
}

function RoundResultIcon({ type }: { type: ReturnType<typeof roundWinType> }) {
  if (type === "spike") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="currentColor" d="M12 2 6.8 8.4l2.1 2.2L12 6.8l3.1 3.8 2.1-2.2L12 2Z" />
        <path fill="currentColor" d="M8.4 11.3h7.2l1.1 7.7L12 22l-4.7-3 1.1-7.7Zm2.5 2.1-.5 4.4 1.6 1 1.6-1-.5-4.4h-2.2Z" />
      </svg>
    );
  }
  if (type === "defuse") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="currentColor" d="M12 2 7 8.2l2.1 2.1L12 6.8l2.9 3.5L17 8.2 12 2Z" opacity="0.55" />
        <path fill="currentColor" d="M6.2 11.5h11.6v2.1H6.2v-2.1Zm2 4h7.6v2.1H8.2v-2.1Z" />
        <path fill="currentColor" d="M18.9 4.3 21 6.4 7.1 20.3 5 18.2 18.9 4.3Z" />
      </svg>
    );
  }
  if (type === "time") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="currentColor" d="M7 2h10v5.2L13.8 12l3.2 4.8V22H7v-5.2l3.2-4.8L7 7.2V2Zm2.5 2.4v2.1l2.5 3.7 2.5-3.7V4.4h-5Zm2.5 9.4-2.5 3.7v2.1h5v-2.1L12 13.8Z" />
      </svg>
    );
  }
  if (type === "surrender") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="currentColor" d="M5 3h2.4v18H5V3Zm4 1.5h9.5l-2.3 4L18.5 12H9V4.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M4.7 3.2 2.8 5.1l5.8 5.8-4 4v3.5h3.5l4-4 6 6 1.9-1.9L4.7 3.2Z" />
      <path fill="currentColor" d="m19.3 3.2 1.9 1.9-5.8 5.8 4 4v3.5h-3.5L2.8 5.1l1.9-1.9 11.2 11.2 1.7-1.7-4-4 5.7-5.5Z" />
    </svg>
  );
}

function UserPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#7b8a96]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12.4a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.1c-4.2 0-7.5 2.1-7.5 4.6V21h15v-1.9c0-2.5-3.3-4.6-7.5-4.6Z"
      />
    </svg>
  );
}

function ScoreboardPortrait({ player }: { player: ScoreboardPlayer }) {
  return (
    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[#2a3540] ring-1 ring-white/10">
      {player.cardIcon ? (
        <>
          <img src={player.cardIcon} alt={player.name || player.agent} className="h-full w-full object-cover object-top" />
          <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/80 to-transparent" />
        </>
      ) : player.agentIcon ? (
        <img src={player.agentIcon} alt={player.agent} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <UserPlaceholderIcon />
        </div>
      )}
      {player.level !== null && (
        <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[9px] font-bold text-white">
          {player.level}
        </span>
      )}
    </div>
  );
}

function ScoreboardTable({
  players,
  myPuuid,
  label,
  accent,
}: {
  players: ScoreboardPlayer[];
  myPuuid: string;
  label: string;
  accent: "green" | "red";
}) {
  const sorted = [...players].sort((a, b) => b.acs - a.acs);
  const headerClass = accent === "green" ? "bg-[#0f5b50] text-[#58ffd8]" : "bg-[#5a1f32] text-[#ff5f75]";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed text-xs">
        <colgroup>
          <col className="w-[190px]" />
          <col className="w-[120px]" />
          <col className="w-[70px]" />
          <col className="w-[54px]" />
          <col className="w-[54px]" />
          <col className="w-[54px]" />
          <col className="w-[66px]" />
          <col className="w-[66px]" />
          <col className="w-[66px]" />
          <col className="w-[66px]" />
        </colgroup>
        <thead>
          <tr className={`${headerClass}`}>
            <th className="py-2 pl-3 text-left font-bold">{label}</th>
            <th className="px-2 py-2 text-left font-medium">Match Rank</th>
            <th className="px-2 py-2 text-center font-medium">ACS</th>
            <th className="px-2 py-2 text-center font-medium">K</th>
            <th className="px-2 py-2 text-center font-medium">D</th>
            <th className="px-2 py-2 text-center font-medium">A</th>
            <th className="px-2 py-2 text-center font-medium">+/-</th>
            <th className="px-2 py-2 text-center font-medium">K/D</th>
            <th className="px-2 py-2 text-center font-medium">HS%</th>
            <th className="px-2 py-2 text-center font-medium">ADR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((player, index) => {
            const isMe = player.puuid === myPuuid;
            return (
              <tr
                key={player.puuid || player.name}
                className={`border-b border-[#0e1821] ${
                  index % 2 === 0 ? "bg-[#101c26]" : "bg-[#192633]"
                } ${isMe ? "outline outline-1 outline-[#ff4655]/40" : ""}`}
              >
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <ScoreboardPortrait player={player} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`truncate text-sm font-black ${isMe ? "text-[#ff4655]" : "text-white"}`}>
                          {player.name || player.agent}
                        </span>
                        {player.tag && <span className="rounded bg-[#263544] px-1 text-[10px] text-[#b8c6d1]">#{player.tag}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {player.agentIcon && <img src={player.agentIcon} alt={player.agent} className="h-3 w-3 rounded object-cover" />}
                        <span className="truncate text-[#8da0ad]">{player.agent}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    {player.tierIcon ? (
                      <img src={player.tierIcon} alt={player.tierName} className="h-6 w-6 object-contain" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[#2a3540]" />
                    )}
                    <span className={`truncate text-[11px] font-bold ${tierColor(player.tierId)}`}>{player.tierName}</span>
                  </div>
                </td>
                <td className="bg-[#24384a] px-2 py-2 text-center text-base font-black text-white">{player.acs}</td>
                <td className="px-2 py-2 text-center text-base font-bold text-white">{player.kills}</td>
                <td className="px-2 py-2 text-center text-base font-bold text-[#ff4655]">{player.deaths}</td>
                <td className="px-2 py-2 text-center text-base font-bold text-white">{player.assists}</td>
                <td className={`px-2 py-2 text-center text-base font-black ${player.plusMinus > 0 ? "text-green-400" : player.plusMinus < 0 ? "text-[#ff4655]" : "text-[#8da0ad]"}`}>
                  {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}
                </td>
                <td className={`px-2 py-2 text-center text-base font-black ${player.kd >= 1 ? "text-green-400" : "text-[#ff4655]"}`}>
                  {player.kd.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-center font-bold text-white">{player.hsPercent}%</td>
                <td className="px-2 py-2 text-center font-bold text-white">{player.adr ?? "--"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function hasUsefulName(player?: ScoreboardPlayer) {
  if (!player) return false;
  const name = player.name.trim().toLowerCase();
  return Boolean(name) && name !== "비공개" && name !== "private" && name !== "unknown";
}

function hasUsefulTier(player?: ScoreboardPlayer) {
  if (!player) return false;
  return player.tierId > 0 && player.tierName.trim().toLowerCase() !== "unranked";
}

function mergePlayerIdentity(fresh: ScoreboardPlayer, previous?: ScoreboardPlayer): ScoreboardPlayer {
  if (!previous) return fresh;

  const usePreviousName = !hasUsefulName(fresh) && hasUsefulName(previous);
  const usePreviousTier = !hasUsefulTier(fresh) && hasUsefulTier(previous);

  return {
    ...fresh,
    name: usePreviousName ? previous.name : fresh.name,
    tag: fresh.tag || previous.tag,
    isPrivate: usePreviousName ? false : fresh.isPrivate,
    cardIcon: fresh.cardIcon || previous.cardIcon,
    agent: fresh.agent && fresh.agent !== "Unknown" ? fresh.agent : previous.agent,
    agentIcon: fresh.agentIcon || previous.agentIcon,
    level: fresh.level ?? previous.level,
    tierId: usePreviousTier ? previous.tierId : fresh.tierId,
    tierName: usePreviousTier ? previous.tierName : fresh.tierName,
    tierIcon: fresh.tierIcon || previous.tierIcon,
  };
}

function mergeScoreboardDetails(
  previous: MatchScoreboardData | null,
  fresh: MatchDetailPayload
): MatchScoreboardData {
  if (!previous) return fresh;

  const previousByPuuid = new Map(previous.players.map((player) => [player.puuid, player]));
  const previousByTeamAgent = new Map(
    previous.players.map((player) => [`${player.teamId}:${player.agent}:${player.kills}:${player.deaths}`, player])
  );

  return {
    ...fresh,
    players: fresh.players.map((player) => {
      const fallbackKey = `${player.teamId}:${player.agent}:${player.kills}:${player.deaths}`;
      const previousPlayer = previousByPuuid.get(player.puuid) ?? previousByTeamAgent.get(fallbackKey);
      return mergePlayerIdentity(player, previousPlayer);
    }),
  };
}

export default function MatchDetailScoreboard({
  matchId,
  myPuuid,
  result,
  initialScoreboard,
}: {
  matchId: string;
  myPuuid: string;
  result: MatchResult;
  initialScoreboard: MatchScoreboardData | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scoreboard, setScoreboard] = useState<MatchScoreboardData | null>(initialScoreboard);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    const details = root?.closest("details");
    if (!details) return;

    let cancelled = false;
    async function load() {
      if (loaded || loading) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/valorant/match/${encodeURIComponent(matchId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("상세 매치 API 실패");
        const payload = (await response.json()) as MatchDetailPayload;
        if (!cancelled && Array.isArray(payload.players)) {
          setScoreboard((previous) => mergeScoreboardDetails(previous, payload));
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setError("최신 상세 데이터를 불러오지 못했습니다. 기존 데이터로 표시합니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function onToggle() {
      if (details?.open) void load();
    }

    if (details.open) void load();
    details.addEventListener("toggle", onToggle);
    return () => {
      cancelled = true;
      details.removeEventListener("toggle", onToggle);
    };
  }, [loaded, loading, matchId]);

  const derived = useMemo(() => {
    if (!scoreboard) return null;
    const myTeamId = scoreboard.players.find((player) => player.puuid === myPuuid)?.teamId ?? "";
    const myTeamPlayers = scoreboard.players.filter((player) => player.teamId === myTeamId);
    const enemyTeamPlayers = scoreboard.players.filter((player) => player.teamId !== myTeamId);
    const myTeam = scoreboard.teams.find((team) => team.teamId === myTeamId);
    const enemyTeam = scoreboard.teams.find((team) => team.teamId !== myTeamId);
    return { myTeamId, myTeamPlayers, enemyTeamPlayers, myTeam, enemyTeam };
  }, [myPuuid, scoreboard]);

  if (!scoreboard || !derived) return null;

  const myLabel = `Team A · ${derived.myTeam?.roundsWon ?? 0}R`;
  const enemyLabel = `Team B · ${derived.enemyTeam?.roundsWon ?? 0}R`;

  return (
    <div ref={rootRef}>
      {(loading || error || loaded) && (
        <div className="border-y border-[#0e1821] bg-[#10202d] px-4 py-2 text-[11px] font-bold text-[#8da0ad]">
          {loading ? "최신 상세 데이터로 보정 중..." : error || "최신 상세 데이터 반영 완료"}
        </div>
      )}
      <div className="bg-[#2a4054] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div>
            <div className="text-[11px] font-bold text-[#9fb0be]">Competitive</div>
            <div className="text-lg font-black text-white">{scoreboard.map}</div>
          </div>
          <div className="flex items-end gap-3 text-lg font-black">
            <span className="text-[#58ffd8]">Team A</span>
            <span className="text-[#58ffd8]">{derived.myTeam?.roundsWon ?? 0}</span>
            <span className="text-white">:</span>
            <span className="text-[#ff5f75]">{derived.enemyTeam?.roundsWon ?? 0}</span>
            <span className="text-[#ff5f75]">Team B</span>
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#9fb0be]">{fmtMatchDate(scoreboard.startedAt)}</div>
            <div className="text-lg font-black text-white">{fmtDuration(scoreboard.gameLengthMs)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-[#9fb0be]">Average Rank</div>
            <div className="text-lg font-black text-white">
              {derived.myTeamPlayers.find((player) => player.tierId > 0)?.tierName ?? "Unrated"}
            </div>
          </div>
        </div>
      </div>
      <div className="border-b border-[#0e1821] bg-[#2a4054] text-sm font-bold text-white">
        <div className="inline-flex min-w-[140px] justify-center border-b-2 border-[#ff4655] py-3">Scoreboard</div>
      </div>
      {scoreboard.rounds.length > 0 && (
        <div className="bg-[#07131e] px-3 py-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
            <div className="whitespace-nowrap text-right text-sm font-bold text-[#58ffd8]">Team A</div>
            <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(scoreboard.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
              {scoreboard.rounds.map((round) => {
                const isMyRound = round.winningTeamId === derived.myTeamId;
                const type = roundWinType(round.result, round.ceremony);
                return (
                  <div
                    key={`${matchId}-team-a-${round.round}`}
                    className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${isMyRound ? "text-[#58ffd8]" : "text-[#263544]"}`}
                    title={`${round.round}R ${isMyRound ? roundWinLabel(type) : ""} ${round.result || round.ceremony || ""}`}
                  >
                    {isMyRound ? <RoundResultIcon type={type} /> : <span className="text-lg font-black leading-none">·</span>}
                  </div>
                );
              })}
            </div>
            <div className="whitespace-nowrap text-right text-sm font-bold text-[#ff5f75]">Team B</div>
            <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(scoreboard.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
              {scoreboard.rounds.map((round) => {
                const isEnemyRound = round.winningTeamId && round.winningTeamId !== derived.myTeamId;
                const type = roundWinType(round.result, round.ceremony);
                return (
                  <div
                    key={`${matchId}-team-b-${round.round}`}
                    className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${isEnemyRound ? "text-[#ff5f75]" : "text-[#263544]"}`}
                    title={`${round.round}R ${isEnemyRound ? roundWinLabel(type) : ""} ${round.result || round.ceremony || ""}`}
                  >
                    {isEnemyRound ? <RoundResultIcon type={type} /> : <span className="text-lg font-black leading-none">·</span>}
                  </div>
                );
              })}
            </div>
            <div className="whitespace-nowrap" />
            <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(scoreboard.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
              {scoreboard.rounds.map((round) => (
                <div key={`${matchId}-num-${round.round}`} className="flex h-4 min-w-0 items-center justify-center text-[9px] text-[#8da0ad]">
                  {round.round}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[58px] text-[10px] text-[#6f8291]">
            {(["elimination", "spike", "defuse", "time"] as const).map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <RoundResultIcon type={type} />
                {roundWinLabel(type)}
              </span>
            ))}
          </div>
        </div>
      )}
      <ScoreboardTable players={derived.myTeamPlayers} myPuuid={myPuuid} label={myLabel} accent={result === "승리" ? "green" : "red"} />
      <ScoreboardTable players={derived.enemyTeamPlayers} myPuuid={myPuuid} label={enemyLabel} accent={result === "패배" ? "green" : "red"} />
    </div>
  );
}
