"use client";

import { useEffect, useState } from "react";
import type { RankData, MatchStats, ScoreboardPlayer } from "@/lib/valorant";
import { normalizeTierName } from "@/lib/tierName";
import MatchDetailScoreboard from "./MatchDetailScoreboard";

type RiotRegion = "KR" | "AP";

interface RegionStats {
  region: RiotRegion;
  riotId: string;
  puuid: string;
  rank: (RankData & { tierId?: number }) | null;
  recentMatches: (Omit<MatchStats, "playedAt"> & { playedAt: string; scrimSessionId?: string | null; scrimTitle?: string | null })[];
  fromCache?: boolean;
  cacheAge?: number | null;
}

const REGION_LABELS: Record<RiotRegion, string> = { KR: "한섭", AP: "아섭" };
const REGIONS_ORDER: RiotRegion[] = ["KR", "AP"];

function buildSummary(matches: RegionStats["recentMatches"]) {
  const wins = matches.filter((m) => m.result === "승리").length;
  const losses = matches.filter((m) => m.result === "패배").length;
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null;
  const avgKills =
    matches.length > 0
      ? (matches.reduce((s, m) => s + m.kills, 0) / matches.length).toFixed(1)
      : null;
  const avgHs =
    matches.length > 0
      ? Math.round(
          matches.reduce((s, m) => {
            const t = m.headshots + m.bodyshots + m.legshots;
            return s + (t > 0 ? (m.headshots / t) * 100 : 0);
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

function RankSummaryCard({
  title, rankName, icon, season, wins, games, rr,
}: {
  title: string; rankName?: string | null; icon?: string | null;
  season?: string | null; wins?: number | null; games?: number | null; rr?: number | null;
}) {
  const safeGames = games ?? 0;
  const safeWins = wins ?? 0;
  const losses = Math.max(safeGames - safeWins, 0);
  const tierLabel = normalizeTierName(rankName) || "정보 없음";
  const seasonLabel = season || "시즌 정보 없음";
  const recordLabel = safeGames > 0 ? `${safeWins}승 ${losses}패` : "승패 정보 없음";
  return (
    <div className="val-card min-w-0 overflow-hidden p-3">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-[#7b8a96]">{title}</div>
      <div className="flex items-center gap-2">
        {icon ? (
          <img src={icon} alt={rankName ?? title} className="h-9 w-9 flex-shrink-0 object-contain drop-shadow-lg" />
        ) : (
          <div className="h-9 w-9 flex-shrink-0 rounded bg-[#111c24] ring-1 ring-[#2a3540]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="val-hover-marquee text-sm font-black leading-tight text-white" title={tierLabel}>
            <span>{tierLabel}</span>
          </div>
          <div className="val-hover-marquee mt-0.5 text-[10px] font-bold leading-tight text-[#8da0ad]" title={seasonLabel}>
            <span>{seasonLabel}</span>
          </div>
          <div className="val-hover-marquee mt-1 text-[10px] leading-tight text-[#7b8a96]" title={`${recordLabel}${typeof rr === "number" ? ` ${rr} RR` : ""}`}>
            <span>{recordLabel}</span>
            {typeof rr === "number" ? <span className="ml-2 text-[#ff4655]">{rr} RR</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#7b8a96]" aria-hidden="true">
      <path fill="currentColor" d="M12 12.4a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.1c-4.2 0-7.5 2.1-7.5 4.6V21h15v-1.9c0-2.5-3.3-4.6-7.5-4.6Z" />
    </svg>
  );
}

function ScoreboardPortrait({ name, agent, cardIcon, agentIcon, level, isPrivate }: {
  name: string; agent: string; cardIcon: string; agentIcon: string;
  level: number | null; isPrivate: boolean;
}) {
  return (
    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[#2a3540] ring-1 ring-white/10">
      {isPrivate ? (
        <div className="flex h-full w-full items-center justify-center"><UserPlaceholderIcon /></div>
      ) : cardIcon ? (
        <>
          <img src={cardIcon} alt={name || agent} className="h-full w-full object-cover object-top" />
          <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/80 to-transparent" />
        </>
      ) : agentIcon ? (
        <img src={agentIcon} alt={agent} className="h-full w-full object-cover" />
      ) : null}
      {!isPrivate && agentIcon && cardIcon && (
        <span className="absolute right-0.5 top-0.5 rounded bg-black/55 p-[2px]">
          <img src={agentIcon} alt={agent} className="h-3 w-3 rounded-sm object-cover" />
        </span>
      )}
      {level !== null && (
        <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[9px] font-bold text-white">{level}</span>
      )}
    </div>
  );
}

function ScoreboardTable({ players, myPuuid, label, accent }: {
  players: ScoreboardPlayer[]; myPuuid: string; label: string; accent: "green" | "red";
}) {
  const sorted = [...players].sort((a, b) => b.acs - a.acs);
  const headerClass = accent === "green" ? "bg-[#0f5b50] text-[#58ffd8]" : "bg-[#5a1f32] text-[#ff5f75]";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed text-xs">
        <colgroup>
          <col className="w-[190px]" /><col className="w-[120px]" /><col className="w-[70px]" />
          <col className="w-[58px]" /><col className="w-[58px]" /><col className="w-[58px]" />
          <col className="w-[70px]" /><col className="w-[70px]" /><col className="w-[70px]" /><col className="w-[70px]" />
        </colgroup>
        <thead>
          <tr className={headerClass}>
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
              <tr key={p.puuid || p.name} className={`border-b border-[#0e1821] ${index % 2 === 0 ? "bg-[#101c26]" : "bg-[#192633]"} ${isMe ? "outline outline-1 outline-[#ff4655]/40" : ""}`}>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <ScoreboardPortrait name={p.name} agent={p.agent} cardIcon={p.cardIcon} agentIcon={p.agentIcon} level={p.level} isPrivate={p.isPrivate} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`truncate text-sm font-black ${isMe ? "text-[#ff4655]" : "text-white"}`}>{p.name || p.agent}</span>
                        {p.tag && <span className="rounded bg-[#263544] px-1 text-[10px] text-[#b8c6d1]">#{p.tag}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {!p.isPrivate && p.agentIcon && <img src={p.agentIcon} alt={p.agent} className="h-3 w-3 rounded object-cover" />}
                        {!p.isPrivate && <span className="truncate text-[#8da0ad]">{p.agent}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    {p.tierIcon ? <img src={p.tierIcon} alt={p.tierName} className="h-6 w-6 object-contain" /> : <div className="h-6 w-6 rounded-full bg-[#2a3540]" />}
                    <span className={`truncate text-[11px] font-bold ${tierColor(p.tierId)}`}>{normalizeTierName(p.tierName, p.tierId)}</span>
                  </div>
                </td>
                <td className="bg-[#24384a] px-2 py-2 text-right text-base font-black text-white">{p.acs}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-white">{p.kills}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-[#ff4655]">{p.deaths}</td>
                <td className="px-2 py-2 text-right text-base font-bold text-white">{p.assists}</td>
                <td className={`px-2 py-2 text-right text-base font-black ${p.plusMinus > 0 ? "text-green-400" : p.plusMinus < 0 ? "text-[#ff4655]" : "text-[#8da0ad]"}`}>
                  {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
                </td>
                <td className={`px-2 py-2 text-right text-base font-black ${p.kd >= 1 ? "text-green-400" : "text-[#ff4655]"}`}>{p.kd.toFixed(1)}</td>
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
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase">{region} · {REGION_LABELS[region]}</div>
        <span className="text-[#7b8a96] text-xs">미연동</span>
      </div>
      <div className="text-white font-bold mb-1">연결된 라이엇 계정이 없습니다.</div>
      <div className="text-[#7b8a96] text-sm">
        상단 <span className="text-[#ff4655]">라이엇 연동</span> 메뉴에서 {REGION_LABELS[region]} 계정을 연결해 주세요.
      </div>
    </div>
  );
}

function RegionMatchList({ matches, trackerUrl, puuid }: {
  matches: RegionStats["recentMatches"]; trackerUrl: string; puuid: string;
}) {
  if (matches.length === 0) {
    return <div className="val-card p-4 text-[#7b8a96] text-sm">최근 매치 데이터가 아직 없습니다.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {matches.map((match, index) => {
        const total = match.headshots + match.bodyshots + match.legshots;
        const hs = total > 0 ? Math.round((match.headshots / total) * 100) : 0;
        const kd = match.deaths > 0 ? (match.kills / match.deaths).toFixed(2) : match.kills.toFixed(2);
        const playedDate = new Date(match.playedAt);
        return (
          <details key={`${match.matchId}-${index}`} className="val-card group" style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: match.result === "승리" ? "#4ade80" : match.result === "패배" ? "#ff4655" : "#52525b", overflow: "visible" }}>
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3">
              {match.agentIcon ? (
                <img src={match.agentIcon} alt={match.agent} className="w-10 h-10 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-[#111c24] flex-shrink-0" />
              )}
              <div className="flex-shrink-0 w-14">
                <div className={`font-black text-sm ${match.result === "승리" ? "text-green-400" : match.result === "패배" ? "text-[#ff4655]" : "text-zinc-400"}`}>{match.result}</div>
                <div className="text-[#7b8a96] text-xs">{match.agent}</div>
              </div>
              {match.scrimSessionId && (
                <a
                  href={`/dashboard/scrim/${match.scrimSessionId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden sm:inline-flex flex-shrink-0 items-center gap-1 rounded border border-[#ff4655]/40 bg-[#ff4655]/10 px-2 py-0.5 text-[10px] font-black text-[#ff4655] hover:bg-[#ff4655]/20 transition-colors"
                >
                  ⚔ 내전
                </a>
              )}
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
                {playedDate.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
              </div>
            </summary>
            <div className="border-t border-[#2a3540] bg-[#07131e]">
              <div className="grid grid-cols-2 gap-3 px-4 py-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-[#7b8a96] text-[10px] uppercase tracking-widest">Score</div>
                  <div className="font-bold text-white">{match.teamScore !== null && match.enemyScore !== null ? `${match.teamScore} : ${match.enemyScore}` : "-"}</div>
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
                  <div className="font-bold text-white">
                    {match.scrimSessionId ? (
                      <a href={`/dashboard/scrim/${match.scrimSessionId}`} className="text-[#ff4655] hover:underline">
                        ⚔ {match.scrimTitle ?? "내전"}
                      </a>
                    ) : match.mode}
                  </div>
                </div>
              </div>
              <MatchDetailScoreboard matchId={match.matchId} myPuuid={puuid} result={match.result} initialScoreboard={match.scoreboard} />
              <a href={trackerUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs font-bold text-[#7b8a96] hover:text-[#ff4655] transition-colors">
                tracker.gg에서 상세 보기
              </a>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function RegionSkeleton() {
  return (
    <section className="bg-[#0a1520] border border-[#2a3540] rounded-xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#2a3540]">
        <div className="w-1 h-8 rounded-full bg-[#2a3540]" />
        <div className="space-y-1.5">
          <div className="h-2.5 w-16 rounded bg-[#2a3540]" />
          <div className="h-5 w-40 rounded bg-[#2a3540]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 mb-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="val-card p-4">
            <div className="h-2 w-20 rounded bg-[#2a3540] mb-3" />
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded bg-[#2a3540]" />
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-[#2a3540]" />
                <div className="h-3 w-16 rounded bg-[#2a3540]" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[0, 1].map((i) => (
          <div key={i} className="val-card p-5">
            <div className="h-2 w-24 rounded bg-[#2a3540] mb-3" />
            <div className="h-8 w-16 rounded bg-[#2a3540]" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="val-card h-16 rounded-lg bg-[#2a3540]/30" />
        ))}
      </div>
    </section>
  );
}

function RegionSection({ data, onRefresh, refreshing }: { data: RegionStats; onRefresh?: () => void; refreshing?: boolean }) {
  const summary = buildSummary(data.recentMatches);
  const trackerUrl = buildTrackerUrl(data.riotId);
  const rank = data.rank;

  return (
    <section className="bg-[#0a1520] border border-[#2a3540] rounded-xl p-5 min-w-0">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a3540]">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-[#ff4655] flex-shrink-0" />
          <div>
            <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">{data.region} · {REGION_LABELS[data.region]}</div>
            <h2 className="text-lg font-black text-white">{data.riotId}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data.fromCache && data.cacheAge != null && (
            <span className="text-[10px] text-[#7b8a96]">{Math.floor(data.cacheAge / 60)}분 전 캐시</span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="전적 갱신"
            className="flex items-center gap-1 rounded border border-[#2a3540] bg-[#111c24] px-2 py-1 text-[11px] font-bold text-[#7b8a96] transition-colors hover:border-[#ff4655]/40 hover:text-white disabled:opacity-50"
          >
            {refreshing ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" /></svg>
            ) : (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
            )}
            갱신
          </button>
          <a href={trackerUrl} target="_blank" rel="noopener noreferrer" className="text-[#7b8a96] text-xs hover:text-[#ff4655] transition-colors">tracker.gg</a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RankSummaryCard title="현재 티어" rankName={rank?.tierName} icon={rank?.rankIcon} season={rank?.currentSeason?.label} wins={rank?.currentSeason?.wins ?? rank?.wins} games={rank?.currentSeason?.games ?? rank?.games} rr={rank?.rr} />
        <RankSummaryCard title="전 티어" rankName={rank?.previousSeason?.tierName} icon={rank?.previousSeason?.rankIcon} season={rank?.previousSeason?.label} wins={rank?.previousSeason?.wins} games={rank?.previousSeason?.games} />
        <RankSummaryCard title="최고 티어" rankName={rank?.peakTierName ?? rank?.peakSeason?.tierName} icon={rank?.peakRankIcon ?? rank?.peakSeason?.rankIcon} season={rank?.peakSeason?.label} wins={rank?.peakSeason?.wins} games={rank?.peakSeason?.games} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">최근 {data.recentMatches.length}경기 승률</div>
          <div className={`text-3xl font-black mb-2 ${summary.winRate !== null ? summary.winRate >= 50 ? "text-green-400" : "text-[#ff4655]" : "text-white"}`}>
            {summary.winRate !== null ? `${summary.winRate}%` : "--"}
          </div>
          {data.recentMatches.length > 0 && (
            <div className="flex gap-0.5">
              {data.recentMatches.map((m, i) => (
                <div key={`${m.matchId}-bar-${i}`} className={`h-1 flex-1 rounded-sm ${m.result === "승리" ? "bg-green-400" : m.result === "패배" ? "bg-[#ff4655]" : "bg-zinc-600"}`} />
              ))}
            </div>
          )}
          <div className="text-[#7b8a96] text-xs mt-1.5">{summary.wins}승 {summary.losses}패</div>
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

      <div className="mb-2">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 매치</div>
        <RegionMatchList matches={data.recentMatches} trackerUrl={trackerUrl} puuid={data.puuid} />
      </div>
    </section>
  );
}

function readStatsCache() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem("valorant-dashboard:valorant-stats:v4");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: { accounts: RegionStats[] } };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > 10 * 60 * 1000) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeStatsCache(data: { accounts: RegionStats[] }) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem("valorant-dashboard:valorant-stats:v4", JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}

export default function ValorantPage() {
  const [data, setData] = useState<{ accounts: RegionStats[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  async function handleRefresh(region: string) {
    setRefreshing((prev) => ({ ...prev, [region]: true }));
    try {
      const res = await fetch(`/api/valorant/stats?forceRegion=${region}`, { cache: "no-store" });
      const d = await res.json() as { accounts?: RegionStats[]; error?: string };
      if (d.accounts) {
        setData((prev) => {
          if (!prev) {
            const next = { accounts: d.accounts! };
            writeStatsCache(next);
            return next;
          }
          const merged = prev.accounts.map((a) => {
            const updated = d.accounts!.find((x) => x.region === a.region);
            if (!updated) return a;
            if (a.recentMatches.length > 0 && updated.recentMatches.length === 0) {
              return { ...updated, recentMatches: a.recentMatches };
            }
            return updated;
          });
          d.accounts!.forEach((a) => {
            if (!merged.find((x) => x.region === a.region)) merged.push(a);
          });
          const next = { accounts: merged };
          writeStatsCache(next);
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setRefreshing((prev) => ({ ...prev, [region]: false }));
    }
  }

  useEffect(() => {
    const cached = readStatsCache();
    if (cached) {
      setData(cached);
    }

    fetch("/api/valorant/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          if (!cached) setError(d.error);
          return;
        }
        setError(null);
        setData(d);
        writeStatsCache(d);
      })
      .catch(() => {
        if (!cached) setError("데이터를 불러오지 못했습니다.");
      });
  }, []);

  const sortedStats = (data?.accounts ?? []).sort(
    (a, b) => REGIONS_ORDER.indexOf(a.region) - REGIONS_ORDER.indexOf(b.region)
  );

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">전적</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">한섭(KR)과 아섭(AP) 계정을 각각 연결해서 전적을 확인할 수 있습니다.</p>
      </div>

      {error && (
        <div className="val-card p-5 text-[#ff4655]">{error}</div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <RegionSkeleton />
          <RegionSkeleton />
        </div>
      )}

      {data && sortedStats.length === 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <EmptyRegionCard region="KR" />
          <EmptyRegionCard region="AP" />
        </div>
      )}

      {data && sortedStats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {(["KR", "AP"] as RiotRegion[]).map((region) => {
            const section = sortedStats.find((item) => item.region === region);
            return section ? (
              <RegionSection
                key={region}
                data={section}
                onRefresh={() => void handleRefresh(region)}
                refreshing={!!refreshing[region]}
              />
            ) : (
              <div key={region}><EmptyRegionCard region={region} /></div>
            );
          })}
        </div>
      )}
    </div>
  );
}
