"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── 인터페이스 ────────────────────────────────────────────────────────────────
interface RiotAccount {
  gameName: string;
  tagLine: string;
  region: string;
  cachedTierName: string | null;
  cachedCard: string | null;
  cachedLevel: number | null;
}

interface ScrimPlayer {
  id: string;
  team: string;
  role: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  user: {
    id: string;
    discordId: string | null;
    name: string | null;
    image: string | null;
    riotAccounts: RiotAccount[];
    valorantRole: string | null;
    favoriteAgents: string;
  };
}

interface ScrimDetail {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  recruitmentChannelId: string | null;
  settings: string | null;
  mode: string | null;
  status: string;
  winnerId: string | null;
  map: string | null;
  startedAt: string | null;
  endedAt: string | null;
  players: ScrimPlayer[];
}

interface ScrimGame {
  id: string;
  sessionId: string;
  gameNumber: number;
  map: string | null;
  winnerId: string | null;
  matchId: string | null;
  teamSnapshot: string; 
  kdaSnapshot: string;  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  roundResults: any; 
  playedAt: string | null;
  createdAt: string;
}

interface GuildMemberOption {
  userId: string;
  discordId: string | null;
  name: string | null;
  image: string | null;
}

interface ScrimDetailSettings {
  teamNames?: Record<string, string>;
  useTeamBoard?: boolean; 
  useCaptain?: boolean;   
}

interface AuctionState {
  id: string;
  sessionId: string;
  phase: string; // setup | auction | reauction | done
  captainPoints: string; 
  queue: string; 
  currentUserId: string | null;
  currentBids: string; 
  auctionStartAt: string | null;
  auctionDuration: number;
  failedQueue: string; 
}

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────
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

function formatDateTime(value: string | null) {
  if (!value) return "시작 시간 미정";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function parseSettings(value: string | null | undefined): ScrimDetailSettings {
  const fallback: ScrimDetailSettings = { useTeamBoard: true, useCaptain: true };
  if (!value) return fallback;
  try { 
    const p = JSON.parse(value); 
    return (p && typeof p === "object") ? { ...fallback, ...p } : fallback;
  } catch { return fallback; }
}

function resolveServerNick(userId: string, guildMembers: GuildMemberOption[], fallback?: string | null): string {
  const m = guildMembers.find((x) => x.userId === userId);
  return m?.name ?? fallback ?? userId.slice(0, 8);
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function ScrimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scrim, setScrim] = useState<ScrimDetail | null>(null);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [guildMembers, setGuildMembers] = useState<GuildMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [games, setGames] = useState<ScrimGame[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const settings = useMemo(() => parseSettings(scrim?.settings), [scrim?.settings]);
  
  const assignedPlayers = useMemo(
    () => (scrim?.players ?? []).filter((p) => p.team.startsWith("team_")),
    [scrim?.players]
  );
  
  const participantPlayers = useMemo(
    () => (scrim?.players ?? []).filter((p) => !p.team.startsWith("team_")),
    [scrim?.players]
  );

  const captainCount = assignedPlayers.filter((p) => p.role === "captain").length;
  const memberCount = assignedPlayers.filter((p) => p.role === "member").length;

  // 상태 변경 핸들러
  const handleStatusChange = async (newStatus: string) => {
    if (!scrim) return;
    const label = newStatus === 'playing' ? '시작' : '종료';
    if (!confirm(`내전을 ${label}하시겠습니까?`)) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/scrim/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        alert(`${label} 처리되었습니다.`);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to update status', error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [sRes, gRes] = await Promise.all([
          fetch(`/api/scrim/${id}`, { cache: "no-store" }),
          fetch(`/api/scrim/${id}/games`, { cache: "no-store" })
        ]);
        const sData = await sRes.json();
        const gData = await gRes.json();
        if (cancelled) return;
        setScrim(sData.scrim ?? null);
        setManagerIds(sData.managerIds ?? []);
        setGuildMembers(sData.guildMembers ?? []);
        setGames(gData.games ?? []);
      } finally { if (!cancelled) setLoading(false); }
    }
    loadData();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>;
  if (!scrim) return <div className="val-card p-12 text-center text-[#7b8a96]">내전을 찾을 수 없습니다.</div>;

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    waiting: { label: "모집 대기", color: "#7b8a96" },
    recruiting: { label: "모집중", color: "#00e7c2" },
    playing: { label: "진행중", color: "#f6c945" },
    done: { label: "완료", color: "#ff4655" },
    finished: { label: "완료", color: "#ff4655" },
  };
  const statusInfo = STATUS_LABELS[scrim.status] ?? STATUS_LABELS.waiting;

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">← 내전 목록</Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black text-white">{scrim.title}</h1>
            <div className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-1 text-xs font-black" style={{ color: statusInfo.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
              {statusInfo.label}
            </div>
          </div>
          <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        
        <div className="flex gap-2">
          {(scrim.status === "waiting" || scrim.status === "recruiting") && (
            <button onClick={() => handleStatusChange("playing")} disabled={saving} className="val-btn bg-[#ff4655] px-4 py-2 text-xs font-black text-white hover:bg-[#ff4655]/80 disabled:opacity-50">
              내전 시작
            </button>
          )}
          {scrim.status === "playing" && (
            <button onClick={() => handleStatusChange("finished")} disabled={saving} className="val-btn bg-[#00e7c2] px-4 py-2 text-xs font-black text-black hover:bg-[#00e7c2]/80 disabled:opacity-50">
              내전 종료
            </button>
          )}
          {(scrim.status === "finished" || scrim.status === "done") && (
            <div className="flex items-center gap-2 rounded bg-[#2a3540] px-3 py-1.5 text-[10px] font-black text-[#c8d3db] uppercase">
              <span className="h-2 w-2 rounded-full bg-[#7b8a96]" />
              종료된 내전
            </div>
          )}
          <Link href="/dashboard/scrim" className="val-btn border border-[#2a3540] bg-[#0f1923] px-4 py-2 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white">목록</Link>
        </div>
      </header>

      {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          <section className="val-card p-5">
            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#ff4655]">내전 정보</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7b8a96]">설명</div>
                <div className="mt-1 text-sm font-bold text-white">{scrim.description || "설명 없음"}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7b8a96]">맵</div>
                <div className="mt-1 text-sm font-bold text-white">{scrim.map || "랜덤"}</div>
              </div>
            </div>
          </section>

          <section className="val-card p-5">
            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#ff4655]">참가자 목록 ({scrim.players.length}명)</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded bg-[#0b141c] p-4">
                <div className="mb-2 text-[10px] font-black text-[#7b8a96]">팀 미배정 ({participantPlayers.length}명)</div>
                <div className="space-y-2">
                  {participantPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded bg-[#1d2732] p-2">
                      {p.user.image && <img src={p.user.image} alt="" className="h-6 w-6 rounded-full" />}
                      <span className="text-xs font-bold text-white">{p.user.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded bg-[#0b141c] p-4">
                <div className="mb-2 text-[10px] font-black text-[#7b8a96]">배정 인원 ({captainCount + memberCount}명)</div>
                <div className="space-y-2">
                  {assignedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded bg-[#1d2732] p-2">
                      <span className="text-xs font-bold text-white">{p.user.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="val-card p-5">
            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">경기 기록 ({games.length}경기)</div>
            {games.length === 0 ? (
              <div className="rounded border border-dashed border-[#2a3540] py-8 text-center text-sm text-[#7b8a96]">
                내전이 시작되면 경기가 자동으로 기록됩니다.
              </div>
            ) : (
              <div className="space-y-4">
                {games.map((game) => (
                  <div key={game.id} className="rounded border border-[#2a3540] bg-[#0b141c] p-4">
                    <div className="text-sm font-black text-white">GAME {game.gameNumber} · {game.map || "진행 중"}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4">
          <section className="val-card p-5">
            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#ff4655]">관리자</div>
            <div className="space-y-2">
              {managerIds.map((mid) => (
                <div key={mid} className="rounded bg-[#1d2732] p-2">
                  <span className="text-xs font-bold text-white">{resolveServerNick(mid, guildMembers)}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="val-card p-5 text-xs leading-relaxed text-[#9aa8b3]">
            <div className="mb-2 font-black text-white">자동 연동 안내</div>
            <p>내전 시작 버튼을 누르면 그때부터 종료 시점까지의 경기가 자동으로 기록됩니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
