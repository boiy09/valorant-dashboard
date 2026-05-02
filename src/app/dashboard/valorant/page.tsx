import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, MatchStats } from "@/lib/valorant";
import TrackerStats from "../TrackerStats";

export const dynamic = "force-dynamic";

export default async function ValorantPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id! } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }

  let rank = null;
  let recentMatches: MatchStats[] = [];

  if (user?.riotPuuid) {
    [rank, recentMatches] = await Promise.all([
      getRankByPuuid(user.riotPuuid).catch(() => null),
      getRecentMatches(user.riotPuuid, 10).catch(() => []),
    ]);
  }

  const wins = recentMatches.filter(m => m.result === "승리").length;
  const winRate = recentMatches.length > 0 ? Math.round(wins / recentMatches.length * 100) : null;
  const avgKills = recentMatches.length > 0
    ? (recentMatches.reduce((s, m) => s + m.kills, 0) / recentMatches.length).toFixed(1) : null;
  const avgHs = recentMatches.length > 0
    ? Math.round(recentMatches.reduce((s, m) => {
        const t = m.headshots + m.bodyshots + m.legshots;
        return s + (t > 0 ? m.headshots / t * 100 : 0);
      }, 0) / recentMatches.length) : null;

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">내 전적</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">라이엇 계정 연동 및 최근 매치 기록</p>
      </div>

      {!user?.riotPuuid && (
        <div className="val-card p-5 mb-6 flex items-center gap-3">
          <span className="text-[#ff4655] text-lg">⚠</span>
          <div>
            <div className="text-white text-sm font-bold">라이엇 계정 미연동</div>
            <div className="text-[#7b8a96] text-xs mt-0.5">우측 상단의 <span className="text-[#ff4655]">라이엇 연동</span> 버튼을 눌러 계정을 연동해주세요.</div>
          </div>
        </div>
      )}

      {user?.riotPuuid && (
        <>
          {/* 스탯 요약 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {/* 랭크 */}
            <div className="val-card p-5 col-span-2">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">현재 랭크</div>
              {rank ? (
                <div className="flex items-center gap-4">
                  {rank.rankIcon
                    ? <img src={rank.rankIcon} alt={rank.tierName} className="w-16 h-16 drop-shadow-lg" />
                    : <div className="w-16 h-16 rounded bg-[#111c24] border border-[#2a3540]" />
                  }
                  <div>
                    <div className="text-xl font-black text-white">{rank.tierName}</div>
                    <div className="text-[#ff4655] font-bold text-lg">{rank.rr} RR</div>
                    <div className="text-[#7b8a96] text-xs mt-1">{rank.wins}승 / {rank.games - rank.wins}패</div>
                    {rank.peakRankIcon && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <img src={rank.peakRankIcon} alt="peak" className="w-4 h-4" />
                        <span className="text-[#7b8a96] text-xs">최고: {rank.peakTierName}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : <div className="text-[#7b8a96]">랭크 정보 없음</div>}
            </div>

            <div className="val-card p-5">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">최근 {recentMatches.length}경기 승률</div>
              <div className={`text-3xl font-black mb-2 ${winRate !== null ? (winRate >= 50 ? "text-green-400" : "text-[#ff4655]") : "text-white"}`}>
                {winRate !== null ? `${winRate}%` : "—"}
              </div>
              {recentMatches.length > 0 && (
                <div className="flex gap-0.5">
                  {recentMatches.map((m, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-sm ${m.result === "승리" ? "bg-green-400" : m.result === "패배" ? "bg-[#ff4655]" : "bg-zinc-600"}`} />
                  ))}
                </div>
              )}
              <div className="text-[#7b8a96] text-xs mt-1.5">{wins}승 {recentMatches.length - wins}패</div>
            </div>

            <div className="val-card p-5">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">평균 KDA</div>
              <div className="text-3xl font-black text-white mb-1">{avgKills ?? "—"}</div>
              <div className="text-[#7b8a96] text-xs">킬 / 게임</div>
              {avgHs !== null && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[#ff4655] font-bold text-sm">{avgHs}%</span>
                  <span className="text-[#7b8a96] text-xs">헤드샷률</span>
                </div>
              )}
            </div>
          </div>

          {/* 매치 기록 */}
          {recentMatches.length > 0 && (
            <div>
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 매치</div>
              <div className="flex flex-col gap-2">
                {recentMatches.map((m, i) => {
                  const total = m.headshots + m.bodyshots + m.legshots;
                  const hs = total > 0 ? Math.round(m.headshots / total * 100) : 0;
                  const kd = m.deaths > 0 ? (m.kills / m.deaths).toFixed(2) : m.kills.toFixed(2);
                  return (
                    <div key={i} className="val-card px-5 py-3 flex items-center gap-4"
                      style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: m.result === "승리" ? "#4ade80" : m.result === "패배" ? "#ff4655" : "#52525b" }}>
                      {m.agentIcon
                        ? <img src={m.agentIcon} alt={m.agent} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded bg-[#111c24] flex-shrink-0" />
                      }
                      <div className="flex-shrink-0 w-14">
                        <div className={`font-black text-sm ${m.result === "승리" ? "text-green-400" : m.result === "패배" ? "text-[#ff4655]" : "text-zinc-400"}`}>{m.result}</div>
                        <div className="text-[#7b8a96] text-xs">{m.agent}</div>
                      </div>
                      <div className="hidden sm:block text-[#7b8a96] text-sm w-16 flex-shrink-0">{m.map}</div>
                      <div className="flex-1">
                        <span className="text-white font-bold">{m.kills}</span>
                        <span className="text-[#7b8a96] text-sm"> / </span>
                        <span className="text-[#ff4655] font-bold">{m.deaths}</span>
                        <span className="text-[#7b8a96] text-sm"> / </span>
                        <span className="text-white font-bold">{m.assists}</span>
                        <span className="text-[#7b8a96] text-xs ml-2">KD {kd}</span>
                      </div>
                      <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                        <span className="text-white text-sm">{hs}%</span>
                        <span className="text-[#7b8a96] text-xs">HS</span>
                      </div>
                      <div className="text-[#7b8a96] text-xs text-right flex-shrink-0">
                        {m.playedAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tracker.gg 커리어 통계 */}
          {user.riotGameName && (
            <div className="mt-6">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3 flex items-center gap-2">
                <span>TRACKER.GG 커리어 통계</span>
                <span className="text-[#ff4655] text-[10px] bg-[#ff4655]/10 px-1.5 py-0.5 rounded">커리어 전체</span>
              </div>
              <TrackerStats gameName={user.riotGameName} tagLine={user.riotTagLine!} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
