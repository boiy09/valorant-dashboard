import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, MatchStats, ScoreboardPlayer } from "@/lib/valorant";
import TrackerStats from "../TrackerStats";

export const dynamic = "force-dynamic";

type RiotRegion = "KR" | "AP";

interface RegionStats {
  region: RiotRegion;
  riotId: string;
  puuid: string;
  rank: Awaited<ReturnType<typeof getRankByPuuid>>;
  recentMatches: MatchStats[];
}

const REGION_LABELS: Record<RiotRegion, string> = {
  KR: "한섭",
  AP: "아섭",
};

const REGIONS_ORDER: RiotRegion[] = ["KR", "AP"];

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      riotAccounts: {
        orderBy: [{ region: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      include: {
        riotAccounts: {
          orderBy: [{ region: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  }

  return user;
}

function toQueryRegion(region: RiotRegion): "kr" | "ap" {
  return region === "AP" ? "ap" : "kr";
}

function buildSummary(matches: MatchStats[]) {
  const wins = matches.filter((match) => match.result === "승리").length;
  const losses = matches.filter((match) => match.result === "패배").length;
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null;
  const avgKills =
    matches.length > 0
      ? (matches.reduce((sum, match) => sum + match.kills, 0) / matches.length).toFixed(1)
      : null;
  const avgHs =
    matches.length > 0
      ? Math.round(
          matches.reduce((sum, match) => {
            const total = match.headshots + match.bodyshots + match.legshots;
            return sum + (total > 0 ? (match.headshots / total) * 100 : 0);
          }, 0) / matches.length
        )
      : null;

  return { wins, losses, winRate, avgKills, avgHs };
}

function buildTrackerUrl(riotId: string) {
  return `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(riotId)}/overview?platform=pc&playlist=competitive`;
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
  if (text.includes("deton") || text.includes("explode") || text.includes("spike") || text.includes("bomb")) {
    return "spike";
  }
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

function ScoreboardTable({ players, myPuuid, label, accent }: {
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
          <col className="w-[58px]" />
          <col className="w-[58px]" />
          <col className="w-[58px]" />
          <col className="w-[70px]" />
          <col className="w-[70px]" />
          <col className="w-[70px]" />
          <col className="w-[70px]" />
        </colgroup>
        <thead>
          <tr className={`${headerClass}`}>
            <th className="py-2 pl-3 text-left font-bold">{label}</th>
            <th className="px-2 py-2 text-left font-medium">Match Rank</th>
            <th className="px-2 py-2 text-right font-medium">ACS</th>
            <th className="px-2 py-2 text-right font-medium">K</th>
            <th className="px-2 py-2 text-right font-medium">D</th>
            <th className="px-2 py-2 text-right font-medium">A</th>
            <th className="px-2 py-2 text-right font-medium">+/-</th>
            <th className="px-2 py-2 text-right font-medium">K/D</th>
            <th className="px-2 py-2 text-right font-medium">HS%</th>
            <th className="py-2 pr-3 text-right font-medium">ADR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, index) => {
            const isMe = p.puuid === myPuuid;
            return (
              <tr
                key={p.puuid || p.name}
                className={`border-b border-[#0e1821] ${
                  index % 2 === 0 ? "bg-[#101c26]" : "bg-[#192633]"
                } ${isMe ? "outline outline-1 outline-[#ff4655]/40" : ""}`}
              >
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[#2a3540]">
                      {p.cardIcon ? (
                        <img src={p.cardIcon} alt={p.name || p.agent} className="h-full w-full object-cover" />
                      ) : p.agentIcon ? (
                        <img src={p.agentIcon} alt={p.agent} className="h-full w-full object-cover" />
                      ) : null}
                      {p.level !== null && (
                        <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-[9px] font-bold text-white">
                          {p.level}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`truncate text-sm font-black ${isMe ? "text-[#ff4655]" : "text-white"}`}>
                          {p.name || p.agent}
                        </span>
                        {p.tag && <span className="rounded bg-[#263544] px-1 text-[10px] text-[#b8c6d1]">#{p.tag}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {p.agentIcon && <img src={p.agentIcon} alt={p.agent} className="h-3 w-3 rounded object-cover" />}
                        <span className="truncate text-[#8da0ad]">{p.agent}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    {p.tierIcon ? (
                      <img src={p.tierIcon} alt={p.tierName} className="h-6 w-6 object-contain" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[#2a3540]" />
                    )}
                    <span className={`truncate text-[11px] font-bold ${tierColor(p.tierId)}`}>{p.tierName}</span>
                  </div>
                </td>
                <td className="bg-[#24384a] px-2 py-2 text-right text-base font-black text-white">{p.acs}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-white">{p.kills}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-[#ff4655]">{p.deaths}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-white">{p.assists}</td>
                <td className={`px-2 py-2 text-right text-base font-black ${p.plusMinus > 0 ? "text-green-400" : p.plusMinus < 0 ? "text-[#ff4655]" : "text-[#8da0ad]"}`}>
                  {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
                </td>
                <td className={`px-2 py-2 text-right text-base font-black ${p.kd >= 1 ? "text-green-400" : "text-[#ff4655]"}`}>
                  {p.kd.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right font-bold text-white">{p.hsPercent}%</td>
                <td className="py-2 pr-3 text-right font-bold text-white">{p.adr ?? "--"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function EmptyRegionCard({ region }: { region: RiotRegion }) {
  return (
    <div className="val-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase">
          {region} · {REGION_LABELS[region]}
        </div>
        <span className="text-[#7b8a96] text-xs">미연동</span>
      </div>
      <div className="text-white font-bold mb-1">연결된 라이엇 계정이 없습니다.</div>
      <div className="text-[#7b8a96] text-sm">
        상단 <span className="text-[#ff4655]">라이엇 연동</span> 메뉴에서 {REGION_LABELS[region]} 계정을
        연결해 주세요.
      </div>
    </div>
  );
}

function RegionMatchList({ matches, trackerUrl, puuid }: { matches: MatchStats[]; trackerUrl: string; puuid: string }) {
  if (matches.length === 0) {
    return <div className="val-card p-4 text-[#7b8a96] text-sm">최근 매치 데이터가 아직 없습니다.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match, index) => {
        const total = match.headshots + match.bodyshots + match.legshots;
        const hs = total > 0 ? Math.round((match.headshots / total) * 100) : 0;
        const kd =
          match.deaths > 0 ? (match.kills / match.deaths).toFixed(2) : match.kills.toFixed(2);

        return (
          <details
            key={`${match.matchId}-${index}`}
            className="val-card group"
            style={{
              borderLeftWidth: 3,
              borderLeftStyle: "solid",
              borderLeftColor:
                match.result === "승리"
                  ? "#4ade80"
                  : match.result === "패배"
                    ? "#ff4655"
                    : "#52525b",
              overflow: "visible",
            }}
          >
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3">
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
              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                <span className="text-white text-sm">{hs}%</span>
                <span className="text-[#7b8a96] text-xs">HS</span>
              </div>
              <div className="text-[#7b8a96] text-xs text-right flex-shrink-0">
                {match.playedAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
              </div>
            </summary>
            <div className="border-t border-[#2a3540] bg-[#07131e]">
              <div className="grid grid-cols-2 gap-3 px-4 py-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-[#7b8a96] text-[10px] uppercase tracking-widest">Score</div>
                  <div className="font-bold text-white">
                    {match.teamScore !== null && match.enemyScore !== null
                      ? `${match.teamScore} : ${match.enemyScore}`
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[#7b8a96] text-[10px] uppercase tracking-widest">ACS</div>
                  <div className="font-bold text-white">{match.score}</div>
                </div>
                <div>
                  <div className="text-[#7b8a96] text-[10px] uppercase tracking-widest">Headshot</div>
                  <div className="font-bold text-white">{hs}%</div>
                </div>
                <div>
                  <div className="text-[#7b8a96] text-[10px] uppercase tracking-widest">Mode</div>
                  <div className="font-bold text-white">{match.mode}</div>
                </div>
              </div>
              {match.scoreboard && (() => {
                const sb = match.scoreboard;
                const myTeamId = sb.players.find(p => p.puuid === puuid)?.teamId ?? "";
                const myTeamPlayers = sb.players.filter(p => p.teamId === myTeamId);
                const enemyTeamPlayers = sb.players.filter(p => p.teamId !== myTeamId);
                const myTeam = sb.teams.find(t => t.teamId === myTeamId);
                const enemyTeam = sb.teams.find(t => t.teamId !== myTeamId);
                const myLabel = `Team A · ${myTeam?.roundsWon ?? 0}R`;
                const enemyLabel = `Team B · ${enemyTeam?.roundsWon ?? 0}R`;
                return (
                  <div>
                    <div className="bg-[#2a4054] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                        <div>
                          <div className="text-[11px] font-bold text-[#9fb0be]">Competitive</div>
                          <div className="text-lg font-black text-white">{sb.map}</div>
                        </div>
                        <div className="flex items-end gap-3 text-lg font-black">
                          <span className="text-[#58ffd8]">Team A</span>
                          <span className="text-[#58ffd8]">{myTeam?.roundsWon ?? 0}</span>
                          <span className="text-white">:</span>
                          <span className="text-[#ff5f75]">{enemyTeam?.roundsWon ?? 0}</span>
                          <span className="text-[#ff5f75]">Team B</span>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-[#9fb0be]">{fmtMatchDate(sb.startedAt)}</div>
                          <div className="text-lg font-black text-white">{fmtDuration(sb.gameLengthMs)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-[#9fb0be]">Average Rank</div>
                          <div className="text-lg font-black text-white">
                            {myTeamPlayers.find((p) => p.tierId > 0)?.tierName ?? "Unrated"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="border-b border-[#0e1821] bg-[#2a4054] text-sm font-bold text-white">
                      <div className="inline-flex min-w-[140px] justify-center border-b-2 border-[#ff4655] py-3">
                        Scoreboard
                      </div>
                    </div>
                    {sb.rounds.length > 0 && (
                      <div className="bg-[#07131e] px-3 py-4">
                        <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-2 gap-y-1">
                          <div className="text-right text-sm font-bold text-[#58ffd8]">Team A</div>
                          <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(sb.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
                            {sb.rounds.map((round) => {
                              const isMyRound = round.winningTeamId === myTeamId;
                              const type = roundWinType(round.result, round.ceremony);
                              return (
                                <div
                                  key={`${match.matchId}-team-a-${round.round}`}
                                  className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${
                                    isMyRound ? "text-[#58ffd8]" : "text-[#263544]"
                                  }`}
                                  title={`${round.round}R ${isMyRound ? roundWinLabel(type) : ""} ${round.result || round.ceremony || ""}`}
                                >
                                  {isMyRound ? <RoundResultIcon type={type} /> : <span className="text-[12px]">·</span>}
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-right text-sm font-bold text-[#ff5f75]">Team B</div>
                          <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(sb.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
                            {sb.rounds.map((round) => {
                              const isEnemyRound = round.winningTeamId && round.winningTeamId !== myTeamId;
                              const type = roundWinType(round.result, round.ceremony);
                              return (
                                <div
                                  key={`${match.matchId}-team-b-${round.round}`}
                                  className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${
                                    isEnemyRound ? "text-[#ff5f75]" : "text-[#263544]"
                                  }`}
                                  title={`${round.round}R ${isEnemyRound ? roundWinLabel(type) : ""} ${round.result || round.ceremony || ""}`}
                                >
                                  {isEnemyRound ? <RoundResultIcon type={type} /> : <span className="text-[12px]">·</span>}
                                </div>
                              );
                            })}
                          </div>
                          <div />
                          <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(sb.rounds.length, 1), 26)}, minmax(0, 1fr))` }}>
                            {sb.rounds.map((round) => (
                              <div key={`${match.matchId}-num-${round.round}`} className="flex h-4 min-w-0 items-center justify-center text-[9px] text-[#8da0ad]">
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
                    <ScoreboardTable players={myTeamPlayers} myPuuid={puuid} label={myLabel} accent="green" />
                    <ScoreboardTable players={enemyTeamPlayers} myPuuid={puuid} label={enemyLabel} accent="red" />
                  </div>
                );
              })()}
              <a
                href={trackerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex text-xs font-bold text-[#7b8a96] hover:text-[#ff4655] transition-colors"
              >
                tracker.gg에서 상세 보기
              </a>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function RegionSection({ data }: { data: RegionStats }) {
  const summary = buildSummary(data.recentMatches);
  const [gameName, tagLine] = data.riotId.split("#");
  const trackerUrl = buildTrackerUrl(data.riotId);

  return (
    <section className="bg-[#0a1520] border border-[#2a3540] rounded-xl p-5 min-w-0">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a3540]">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-[#ff4655] flex-shrink-0" />
          <div>
            <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
              {data.region} · {REGION_LABELS[data.region]}
            </div>
            <h2 className="text-lg font-black text-white">{data.riotId}</h2>
          </div>
        </div>
        <a
          href={trackerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7b8a96] text-xs hover:text-[#ff4655] transition-colors flex-shrink-0"
        >
          tracker.gg
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="val-card p-5 col-span-2">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">현재 랭크</div>
          {data.rank ? (
            <div className="flex items-center gap-4">
              {data.rank.rankIcon ? (
                <img src={data.rank.rankIcon} alt={data.rank.tierName} className="w-16 h-16 drop-shadow-lg" />
              ) : (
                <div className="w-16 h-16 rounded bg-[#111c24] border border-[#2a3540]" />
              )}
              <div>
                <div className="text-xl font-black text-white">{data.rank.tierName}</div>
                <div className="text-[#ff4655] font-bold text-lg">
                  {data.rank.rr !== null ? `${data.rank.rr} RR` : "RR 정보 없음"}
                </div>
                {data.rank.rrChange !== null ? (
                  <div
                    className={`text-xs font-bold ${
                      data.rank.rrChange > 0
                        ? "text-green-400"
                        : data.rank.rrChange < 0
                          ? "text-[#ff4655]"
                          : "text-[#7b8a96]"
                    }`}
                  >
                    최근 변동 {data.rank.rrChange > 0 ? "+" : ""}
                    {data.rank.rrChange} RR
                  </div>
                ) : (
                  <div className="text-[#7b8a96] text-xs font-bold">
                    {data.rank.isCurrent ? "최근 변동 정보 없음" : "최근 티어 기록"}
                  </div>
                )}
                <div className="text-[#7b8a96] text-xs mt-1">
                  {data.rank.wins}승 / {Math.max(data.rank.games - data.rank.wins, 0)}패
                </div>
                {data.rank.peakRankIcon && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <img src={data.rank.peakRankIcon} alt="peak" className="w-4 h-4" />
                    <span className="text-[#7b8a96] text-xs">최고: {data.rank.peakTierName}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[#7b8a96]">랭크 정보가 아직 없습니다.</div>
          )}
        </div>

        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">
            최근 {data.recentMatches.length}경기 승률
          </div>
          <div
            className={`text-3xl font-black mb-2 ${
              summary.winRate !== null
                ? summary.winRate >= 50
                  ? "text-green-400"
                  : "text-[#ff4655]"
                : "text-white"
            }`}
          >
            {summary.winRate !== null ? `${summary.winRate}%` : "--"}
          </div>
          {data.recentMatches.length > 0 && (
            <div className="flex gap-0.5">
              {data.recentMatches.map((match, index) => (
                <div
                  key={`${match.matchId}-bar-${index}`}
                  className={`h-1 flex-1 rounded-sm ${
                    match.result === "승리"
                      ? "bg-green-400"
                      : match.result === "패배"
                        ? "bg-[#ff4655]"
                        : "bg-zinc-600"
                  }`}
                />
              ))}
            </div>
          )}
          <div className="text-[#7b8a96] text-xs mt-1.5">
            {summary.wins}승 {summary.losses}패
          </div>
        </div>

        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">평균 킬</div>
          <div className="text-3xl font-black text-white mb-1">{summary.avgKills ?? "--"}</div>
          <div className="text-[#7b8a96] text-xs">최근 경기 기준</div>
          {summary.avgHs !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[#ff4655] font-bold text-sm">{summary.avgHs}%</span>
              <span className="text-[#7b8a96] text-xs">헤드샷률</span>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 매치</div>
        <RegionMatchList matches={data.recentMatches} trackerUrl={trackerUrl} puuid={data.puuid} />
      </div>

      <div>
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3 flex items-center gap-2">
          <span>상세 전적 통계</span>
          <span className="text-[#ff4655] text-[10px] bg-[#ff4655]/10 px-1.5 py-0.5 rounded">
            최근 20경기
          </span>
        </div>
        <TrackerStats
          key={`${data.region}-${data.riotId}`}
          gameName={gameName}
          tagLine={tagLine}
          region={data.region}
        />
      </div>
    </section>
  );
}

export default async function ValorantPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const user = await findUser(session.user.id!, session.user.email);
  const accounts = user?.riotAccounts ?? [];

  const accountStats = await Promise.all(
    accounts.map(async (account) => {
      const [rank, recentMatches] = await Promise.all([
        getRankByPuuid(account.puuid, toQueryRegion(account.region as RiotRegion), {
          gameName: account.gameName,
          tagLine: account.tagLine,
        }).catch(() => null),
        getRecentMatches(account.puuid, 10, toQueryRegion(account.region as RiotRegion)).catch(() => []),
      ]);

      return {
        region: account.region as RiotRegion,
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
        rank,
        recentMatches,
      } satisfies RegionStats;
    })
  );

  const sortedStats = accountStats.sort(
    (a, b) => REGIONS_ORDER.indexOf(a.region) - REGIONS_ORDER.indexOf(b.region)
  );

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">전적</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          한섭(KR)과 아섭(AP) 계정을 각각 연결해서 전적을 확인할 수 있습니다.
        </p>
      </div>

      {sortedStats.length === 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <EmptyRegionCard region="KR" />
          <EmptyRegionCard region="AP" />
        </div>
      )}

      {sortedStats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {(["KR", "AP"] as RiotRegion[]).map((region) => {
            const section = sortedStats.find((item) => item.region === region);
            return section ? (
              <RegionSection key={region} data={section} />
            ) : (
              <div key={region}>
                <EmptyRegionCard region={region} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
