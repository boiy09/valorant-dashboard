"use client";

import { useState, useEffect } from "react";
import ActivityChart from "./ActivityChart";
import AttendanceCalendar from "./AttendanceCalendar";
import BotStatus from "./BotStatus";

// ─── Types ────────────────────────────────────────────────────
interface ActivityData {
  weeklyData: { date: string; hours: number }[];
  attendanceDates: string[];
  totalSeconds: number;
  monthSeconds: number;
  attendanceCount: number;
}

interface RankingEntry {
  rank: number;
  name: string;
  hours: number;
  minutes: number;
  image: string | null;
  userId: string;
}

interface MarketPost {
  id: string;
  title: string;
  description: string;
  price: number | null;
  category: string;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  user: { name: string | null; discordId: string | null; image: string | null };
}

interface VoteItem {
  id: string;
  title: string;
  endsAt: string;
  active: boolean;
  total: number;
  options: { id: string; label: string; count: number }[];
}

interface PointEntry {
  rank: number;
  user: { name: string | null; discordId: string | null; image: string | null } | null;
  points: number;
}

interface HighlightItem {
  id: string;
  title: string;
  description: string | null;
  url: string;
  type: string;
  likes: number;
  createdAt: string;
  user: { name: string | null; image: string | null };
}

interface AgentStat {
  agent: string;
  games: number;
  winRate: number;
  avgKills: string;
  avgDeaths: string;
  kd: string;
}

interface Application {
  id: string;
  riotId: string;
  mainAgent: string;
  playtime: string;
  motivation: string;
  status: string;
  createdAt: string;
  user: { name: string | null; discordId: string | null; image: string | null };
}

// ─── Helpers ──────────────────────────────────────────────────
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`;
}

const CATEGORY_COLORS: Record<string, string> = {
  계정: "text-purple-400", 코인: "text-yellow-400", 아이템: "text-blue-400", 기타: "text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = { sale: "판매중", reserved: "예약중", sold: "거래완료" };
const STATUS_COLORS: Record<string, string> = { sale: "text-green-400", reserved: "text-yellow-400", sold: "text-zinc-500" };

// ─── Main Component ───────────────────────────────────────────
const TABS = [
  { id: "activity",  label: "활동 현황" },
  { id: "stats",     label: "전적 분석" },
  { id: "scrim",     label: "내전/일정" },
  { id: "market",    label: "마켓" },
  { id: "vote",      label: "투표" },
  { id: "points",    label: "포인트" },
  { id: "highlight", label: "하이라이트" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function DashboardClient() {
  const [tab, setTab] = useState<TabId>("activity");
  const [rankType, setRankType] = useState<"weekly" | "monthly">("weekly");

  // Activity
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);

  // Stats
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);
  const [formData, setFormData] = useState<any>(null);
  const [serverStats, setServerStats] = useState<any>(null);
  const [statsView, setStatsView] = useState<"agents" | "form" | "server">("agents");

  // Scrim
  const [scrims, setScrims] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  // Market
  const [marketPosts, setMarketPosts] = useState<MarketPost[]>([]);
  const [marketCategory, setMarketCategory] = useState("all");
  const [showMarketForm, setShowMarketForm] = useState(false);
  const [marketForm, setMarketForm] = useState({ title: "", description: "", price: "", category: "기타", imageUrl: "" });

  // Vote
  const [votes, setVotes] = useState<VoteItem[]>([]);

  // Points
  const [pointRanking, setPointRanking] = useState<PointEntry[]>([]);
  const [myPoints, setMyPoints] = useState<{ total: number; history: any[] } | null>(null);

  // Highlight
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [hlType, setHlType] = useState<"clip" | "screenshot">("clip");
  const [showHlForm, setShowHlForm] = useState(false);
  const [hlForm, setHlForm] = useState({ title: "", description: "", url: "", type: "clip" });

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load activity
  useEffect(() => {
    fetch("/api/activity").then(r => r.json()).then(setActivity).catch(() => {});
  }, []);

  // Load ranking
  useEffect(() => {
    fetch(`/api/ranking?type=${rankType}`).then(r => r.json()).then(d => setRanking(d.ranking ?? [])).catch(() => {});
  }, [rankType]);

  // Load by tab
  useEffect(() => {
    if (tab === "stats" && agentStats.length === 0) {
      fetch("/api/stats?type=agents").then(r => r.json()).then(d => setAgentStats(d.agents ?? []));
      fetch("/api/stats?type=server").then(r => r.json()).then(setServerStats);
    }
    if (tab === "scrim") {
      fetch("/api/scrim").then(r => r.json()).then(d => setScrims(d.sessions ?? []));
      fetch("/api/activity").then(r => r.json()).then(() => {}); // ensure loaded
    }
    if (tab === "market") {
      fetch("/api/market").then(r => r.json()).then(d => setMarketPosts(d.posts ?? []));
    }
    if (tab === "vote") {
      fetch("/api/vote").then(r => r.json()).then(d => setVotes(d.votes ?? []));
    }
    if (tab === "points") {
      fetch("/api/points?type=ranking").then(r => r.json()).then(d => setPointRanking(d.ranking ?? []));
      fetch("/api/points?type=me").then(r => r.json()).then(setMyPoints);
    }
    if (tab === "highlight") {
      fetch(`/api/highlight?type=${hlType}`).then(r => r.json()).then(d => setHighlights(d.highlights ?? []));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "stats") {
      if (statsView === "form" && !formData) {
        fetch("/api/stats?type=form").then(r => r.json()).then(setFormData);
      }
    }
  }, [statsView, tab]);

  useEffect(() => {
    if (tab === "highlight") {
      fetch(`/api/highlight?type=${hlType}`).then(r => r.json()).then(d => setHighlights(d.highlights ?? []));
    }
  }, [hlType]);

  async function submitMarket(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(marketForm),
    });
    setLoading(false);
    if (res.ok) {
      setShowMarketForm(false);
      setMarketForm({ title: "", description: "", price: "", category: "기타", imageUrl: "" });
      fetch("/api/market").then(r => r.json()).then(d => setMarketPosts(d.posts ?? []));
    }
  }

  async function submitHighlight(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/highlight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hlForm),
    });
    setLoading(false);
    if (res.ok) {
      setShowHlForm(false);
      setHlForm({ title: "", description: "", url: "", type: "clip" });
      fetch(`/api/highlight?type=${hlType}`).then(r => r.json()).then(d => setHighlights(d.highlights ?? []));
    }
  }

  async function likeHighlight(id: string) {
    await fetch("/api/highlight", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ highlightId: id }) });
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, likes: h.likes + 1 } : h));
  }

  const filteredMarket = marketPosts.filter(p => marketCategory === "all" || p.category === marketCategory);

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-0.5 border-b border-[#2a3540] mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium tracking-wide transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? "border-[#ff4655] text-white" : "border-transparent text-[#7b8a96] hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 활동 현황 ─────────────────────────────────────────── */}
      {tab === "activity" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "이번달 활동", value: activity ? fmtTime(activity.monthSeconds) : "—" },
                { label: "총 활동", value: activity ? fmtTime(activity.totalSeconds) : "—" },
                { label: "출석 (30일)", value: activity ? `${activity.attendanceCount}일` : "—" },
              ].map((s) => (
                <div key={s.label} className="val-card p-4">
                  <div className="text-[#7b8a96] text-xs tracking-wider mb-1">{s.label}</div>
                  <div className="text-white font-black text-lg">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="val-card p-5">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">주간 활동</div>
              {activity ? <ActivityChart data={activity.weeklyData} /> : <div className="h-20 flex items-center justify-center text-[#7b8a96] text-sm">로딩 중...</div>}
            </div>
            <div className="val-card p-5">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">출석 현황 (4주)</div>
              {activity ? <AttendanceCalendar attendanceDates={activity.attendanceDates} /> : <div className="text-[#7b8a96] text-sm">로딩 중...</div>}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="val-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[#7b8a96] text-xs tracking-widest uppercase">활동 랭킹</div>
                <div className="flex gap-1">
                  {(["weekly", "monthly"] as const).map(t => (
                    <button key={t} onClick={() => setRankType(t)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${rankType === t ? "bg-[#ff4655] text-white" : "text-[#7b8a96] hover:text-white"}`}>
                      {t === "weekly" ? "주간" : "월간"}
                    </button>
                  ))}
                </div>
              </div>
              {ranking.length === 0 ? (
                <div className="text-[#7b8a96] text-sm text-center py-8">아직 활동 데이터가 없어요<br/><span className="text-xs">음성채널에 접속하면 기록돼요</span></div>
              ) : (
                <div className="flex flex-col gap-2">
                  {ranking.map((r) => (
                    <div key={r.rank} className={`flex items-center gap-3 py-1.5 ${r.rank <= 3 ? "stat-highlight px-2 rounded" : ""}`}>
                      <span className={`text-sm font-black w-5 text-center ${r.rank === 1 ? "text-yellow-400" : r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-[#7b8a96]"}`}>{r.rank}</span>
                      {r.image ? <img src={r.image} alt={r.name} className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-[#2a3540] flex items-center justify-center text-xs text-[#7b8a96]">{r.name?.[0]}</div>}
                      <span className="flex-1 text-white text-sm truncate">{r.name}</span>
                      <span className="text-[#ff4655] text-xs font-bold">{r.hours > 0 ? `${r.hours}h ${r.minutes}m` : `${r.minutes}m`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <BotStatus />
          </div>
        </div>
      )}

      {/* ── 전적 분석 ─────────────────────────────────────────── */}
      {tab === "stats" && (
        <div>
          <div className="flex gap-1 mb-5">
            {(["agents", "form", "server"] as const).map(v => (
              <button key={v} onClick={() => setStatsView(v)}
                className={`val-btn px-4 py-1.5 text-sm ${statsView === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
                {v === "agents" ? "에이전트별" : v === "form" ? "폼 분석" : "서버 통계"}
              </button>
            ))}
          </div>

          {statsView === "agents" && (
            <div>
              {agentStats.length === 0 ? (
                <div className="val-card p-12 text-center text-[#7b8a96]">라이엇 계정을 연동하면 에이전트 통계가 표시돼요</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {agentStats.map(a => (
                    <div key={a.agent} className="val-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-white font-bold">{a.agent}</span>
                        <span className="text-xs text-[#7b8a96]">{a.games}판</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><div className={`font-black ${a.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{a.winRate}%</div><div className="text-[#7b8a96] text-xs">승률</div></div>
                        <div><div className="text-white font-black">{a.kd}</div><div className="text-[#7b8a96] text-xs">KD</div></div>
                        <div><div className="text-white font-black">{a.avgKills}</div><div className="text-[#7b8a96] text-xs">평킬</div></div>
                      </div>
                      <div className="mt-2 h-1 bg-[#111c24] rounded-full">
                        <div className="h-1 bg-[#ff4655] rounded-full transition-all" style={{ width: `${a.winRate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {statsView === "form" && (
            <div>
              {!formData ? (
                <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="val-card p-5">
                    <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">구간별 폼</div>
                    <div className="flex flex-col gap-3">
                      {formData.form?.map((chunk: any, i: number) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm">{chunk.label}</span>
                            <span className={`text-sm font-bold ${chunk.wins / chunk.games >= 0.5 ? "text-green-400" : "text-[#ff4655]"}`}>
                              {chunk.wins}승 {chunk.games - chunk.wins}패
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#111c24] rounded-full">
                            <div className={`h-1.5 rounded-full ${chunk.wins / chunk.games >= 0.5 ? "bg-green-400" : "bg-[#ff4655]"}`}
                              style={{ width: `${Math.round(chunk.wins / chunk.games * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="val-card p-5">
                    <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">최근 10경기 흐름</div>
                    <div className="flex gap-1 flex-wrap">
                      {formData.matches?.map((m: any, i: number) => (
                        <div key={i} title={`${m.agent} — ${m.kills}/${m.deaths}/${m.assists}`}
                          className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${m.result === "승리" ? "bg-green-400/20 text-green-400" : "bg-[#ff4655]/20 text-[#ff4655]"}`}>
                          {m.result === "승리" ? "W" : "L"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {statsView === "server" && (
            <div>
              {!serverStats ? (
                <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "분석된 매치", value: serverStats.totalMatches },
                      { label: "연동 유저", value: serverStats.totalUsers },
                      { label: "평균 킬", value: serverStats.avgKills },
                      { label: "평균 데스", value: serverStats.avgDeaths },
                    ].map(s => (
                      <div key={s.label} className="val-card p-4">
                        <div className="text-[#7b8a96] text-xs mb-1">{s.label}</div>
                        <div className="text-white font-black text-xl">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="val-card p-5">
                    <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">서버 인기 에이전트 TOP 10</div>
                    <div className="flex flex-col gap-2">
                      {serverStats.topAgents?.map((a: any, i: number) => (
                        <div key={a.agent} className="flex items-center gap-3">
                          <span className="text-[#7b8a96] text-xs w-4">{i + 1}</span>
                          <span className="text-white text-sm flex-1">{a.agent}</span>
                          <span className="text-xs text-[#7b8a96]">{a.games}판</span>
                          <span className={`text-xs font-bold ${a.winRate >= 50 ? "text-green-400" : "text-[#ff4655]"}`}>{a.winRate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 내전/일정 ─────────────────────────────────────────── */}
      {tab === "scrim" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 내전</div>
            {scrims.length === 0 ? (
              <div className="val-card p-8 text-center text-[#7b8a96]">
                아직 내전 기록이 없어요<br/>
                <code className="text-xs bg-[#111c24] px-1 rounded mt-1 inline-block">/내전 시작</code> 또는 <code className="text-xs bg-[#111c24] px-1 rounded">/큐 참가</code>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {scrims.slice(0, 5).map(s => {
                  const teamA = s.players?.filter((p: any) => p.team === "team_a") ?? [];
                  const teamB = s.players?.filter((p: any) => p.team === "team_b") ?? [];
                  return (
                    <div key={s.id} className="val-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-bold text-sm">{s.title}</span>
                        <div className="flex items-center gap-2">
                          {s.winnerId && (
                            <span className={`text-xs px-2 py-0.5 rounded ${s.winnerId === "draw" ? "bg-zinc-700 text-zinc-300" : "bg-[#ff4655]/20 text-[#ff4655]"}`}>
                              {s.winnerId === "team_a" ? "팀A 승" : s.winnerId === "team_b" ? "팀B 승" : "무승부"}
                            </span>
                          )}
                          <span className="text-[#7b8a96] text-xs">{new Date(s.createdAt).toLocaleDateString("ko-KR")}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-[#111c24] rounded p-2">
                          <div className="text-[#ff4655] mb-1">팀 A</div>
                          {teamA.map((p: any, i: number) => <div key={i} className="text-white">{p.user?.name}</div>)}
                        </div>
                        <div className="bg-[#111c24] rounded p-2">
                          <div className="text-blue-400 mb-1">팀 B</div>
                          {teamB.map((p: any, i: number) => <div key={i} className="text-white">{p.user?.name}</div>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">예정 일정</div>
            <div className="val-card p-5 text-center text-[#7b8a96]">
              <div className="text-sm mb-1">Discord에서 일정을 등록하세요</div>
              <code className="text-xs bg-[#111c24] px-1 rounded">/일정 등록</code>
            </div>
          </div>
        </div>
      )}

      {/* ── 마켓 ──────────────────────────────────────────────── */}
      {tab === "market" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {["all", "계정", "코인", "아이템", "기타"].map(c => (
                <button key={c} onClick={() => setMarketCategory(c)}
                  className={`text-xs px-3 py-1 rounded transition-colors ${marketCategory === c ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
                  {c === "all" ? "전체" : c}
                </button>
              ))}
            </div>
            <button onClick={() => setShowMarketForm(!showMarketForm)}
              className="val-btn bg-[#ff4655] text-white text-sm px-5 py-1.5 font-bold">
              + 글쓰기
            </button>
          </div>

          {showMarketForm && (
            <form onSubmit={submitMarket} className="val-card p-5 mb-4 flex flex-col gap-3">
              <div className="text-white font-bold mb-1">마켓 글 작성</div>
              <input value={marketForm.title} onChange={e => setMarketForm(f => ({ ...f, title: e.target.value }))}
                placeholder="제목" required className="val-input px-4 py-2 text-sm" />
              <textarea value={marketForm.description} onChange={e => setMarketForm(f => ({ ...f, description: e.target.value }))}
                placeholder="설명" required rows={3} className="val-input px-4 py-2 text-sm resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={marketForm.price} onChange={e => setMarketForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="가격 (선택)" className="val-input px-4 py-2 text-sm" />
                <select value={marketForm.category} onChange={e => setMarketForm(f => ({ ...f, category: e.target.value }))}
                  className="val-input px-4 py-2 text-sm">
                  {["기타", "계정", "코인", "아이템"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="val-btn bg-[#ff4655] text-white text-sm px-6 py-2 font-bold disabled:opacity-50">등록</button>
                <button type="button" onClick={() => setShowMarketForm(false)} className="val-btn bg-[#1a242d] text-[#7b8a96] text-sm px-6 py-2">취소</button>
              </div>
            </form>
          )}

          {filteredMarket.length === 0 ? (
            <div className="val-card p-12 text-center text-[#7b8a96]">게시물이 없어요</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMarket.map(p => (
                <div key={p.id} className="val-card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className={`text-xs font-bold ${CATEGORY_COLORS[p.category] ?? "text-zinc-400"}`}>{p.category}</span>
                      <div className="text-white font-bold mt-0.5">{p.title}</div>
                    </div>
                    <span className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                  </div>
                  <p className="text-[#7b8a96] text-sm mb-3 line-clamp-2">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold">{p.price ? `${p.price.toLocaleString()}원` : "무료/협의"}</span>
                    <div className="flex items-center gap-1.5">
                      {p.user.image && <img src={p.user.image} alt="" className="w-5 h-5 rounded-full" />}
                      <span className="text-[#7b8a96] text-xs">{p.user.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 투표 ──────────────────────────────────────────────── */}
      {tab === "vote" && (
        <div>
          <div className="text-[#7b8a96] text-sm mb-4">Discord에서 <code className="bg-[#111c24] px-1 rounded">/투표 생성</code> 명령어로 투표를 만드세요</div>
          {votes.length === 0 ? (
            <div className="val-card p-12 text-center text-[#7b8a96]">진행 중인 투표가 없어요</div>
          ) : (
            <div className="flex flex-col gap-4">
              {votes.map(v => {
                const total = v.total;
                return (
                  <div key={v.id} className="val-card p-5">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="text-white font-bold">{v.title}</h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded ${v.active ? "bg-green-400/20 text-green-400" : "bg-zinc-700 text-zinc-400"}`}>
                          {v.active ? "진행 중" : "종료"}
                        </span>
                        <span className="text-[#7b8a96] text-xs">{total}명 참여</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {v.options.map(opt => {
                        const pct = total > 0 ? Math.round(opt.count / total * 100) : 0;
                        return (
                          <div key={opt.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-white text-sm">{opt.label}</span>
                              <span className="text-[#7b8a96] text-xs">{pct}% ({opt.count}표)</span>
                            </div>
                            <div className="h-2 bg-[#111c24] rounded-full">
                              <div className="h-2 bg-[#ff4655] rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-[#7b8a96] text-xs">종료: {new Date(v.endsAt).toLocaleString("ko-KR")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 포인트 ────────────────────────────────────────────── */}
      {tab === "points" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">💎 포인트 랭킹</div>
            {pointRanking.length === 0 ? (
              <div className="text-[#7b8a96] text-center py-8">아직 포인트 데이터가 없어요<br/><span className="text-xs">출석, 내전 승리, 관리자 지급으로 포인트를 쌓아요</span></div>
            ) : (
              <div className="flex flex-col gap-2">
                {pointRanking.map(r => (
                  <div key={r.rank} className={`flex items-center gap-3 py-2 ${r.rank <= 3 ? "stat-highlight px-2 rounded" : ""}`}>
                    <span className={`font-black w-6 text-center ${r.rank === 1 ? "text-yellow-400 text-lg" : r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-[#7b8a96] text-sm"}`}>
                      {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                    </span>
                    {r.user?.image ? <img src={r.user.image} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-[#2a3540]" />}
                    <span className="flex-1 text-white font-medium">{r.user?.name ?? "Unknown"}</span>
                    <span className="text-[#ff4655] font-black">{r.points.toLocaleString()} P</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">내 포인트</div>
            {myPoints ? (
              <>
                <div className="text-4xl font-black text-white mb-1">{myPoints.total.toLocaleString()}</div>
                <div className="text-[#7b8a96] text-sm mb-4">포인트</div>
                <div className="text-[#7b8a96] text-xs tracking-wider uppercase mb-2">최근 내역</div>
                <div className="flex flex-col gap-1.5">
                  {myPoints.history.slice(0, 8).map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between text-sm">
                      <span className="text-[#7b8a96] truncate">{h.reason}</span>
                      <span className={`font-bold flex-shrink-0 ml-2 ${h.amount > 0 ? "text-green-400" : "text-[#ff4655]"}`}>
                        {h.amount > 0 ? "+" : ""}{h.amount}P
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="text-[#7b8a96] text-sm">로딩 중...</div>}
          </div>
        </div>
      )}

      {/* ── 하이라이트 ────────────────────────────────────────── */}
      {tab === "highlight" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {(["clip", "screenshot"] as const).map(t => (
                <button key={t} onClick={() => setHlType(t)}
                  className={`text-xs px-3 py-1 rounded ${hlType === t ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
                  {t === "clip" ? "클립" : "스크린샷"}
                </button>
              ))}
            </div>
            <button onClick={() => setShowHlForm(!showHlForm)}
              className="val-btn bg-[#ff4655] text-white text-sm px-5 py-1.5 font-bold">
              + 업로드
            </button>
          </div>

          {showHlForm && (
            <form onSubmit={submitHighlight} className="val-card p-5 mb-4 flex flex-col gap-3">
              <div className="text-white font-bold">하이라이트 업로드</div>
              <input value={hlForm.title} onChange={e => setHlForm(f => ({ ...f, title: e.target.value }))}
                placeholder="제목" required className="val-input px-4 py-2 text-sm" />
              <input value={hlForm.url} onChange={e => setHlForm(f => ({ ...f, url: e.target.value }))}
                placeholder="영상/이미지 URL" required className="val-input px-4 py-2 text-sm" />
              <textarea value={hlForm.description} onChange={e => setHlForm(f => ({ ...f, description: e.target.value }))}
                placeholder="설명 (선택)" rows={2} className="val-input px-4 py-2 text-sm resize-none" />
              <select value={hlForm.type} onChange={e => setHlForm(f => ({ ...f, type: e.target.value }))}
                className="val-input px-4 py-2 text-sm">
                <option value="clip">클립</option>
                <option value="screenshot">스크린샷</option>
              </select>
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="val-btn bg-[#ff4655] text-white text-sm px-6 py-2 font-bold disabled:opacity-50">업로드</button>
                <button type="button" onClick={() => setShowHlForm(false)} className="val-btn bg-[#1a242d] text-[#7b8a96] text-sm px-6 py-2">취소</button>
              </div>
            </form>
          )}

          {highlights.length === 0 ? (
            <div className="val-card p-12 text-center text-[#7b8a96]">아직 {hlType === "clip" ? "클립" : "스크린샷"}이 없어요</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {highlights.map(h => (
                <div key={h.id} className="val-card p-4">
                  {hlType === "screenshot" && (
                    <img src={h.url} alt={h.title} className="w-full h-36 object-cover rounded mb-3" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                  {hlType === "clip" && (
                    <a href={h.url} target="_blank" rel="noopener noreferrer"
                      className="block w-full h-28 bg-[#111c24] rounded mb-3 flex items-center justify-center text-[#7b8a96] hover:text-white transition-colors">
                      ▶ 클립 보기
                    </a>
                  )}
                  <div className="text-white font-bold text-sm mb-1">{h.title}</div>
                  {h.description && <p className="text-[#7b8a96] text-xs mb-2 line-clamp-2">{h.description}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {h.user.image && <img src={h.user.image} alt="" className="w-5 h-5 rounded-full" />}
                      <span className="text-[#7b8a96] text-xs">{h.user.name}</span>
                    </div>
                    <button onClick={() => likeHighlight(h.id)} className="flex items-center gap-1 text-xs text-[#7b8a96] hover:text-[#ff4655] transition-colors">
                      ♥ {h.likes}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
