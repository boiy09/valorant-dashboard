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

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function resolveServerNick(userId: string, guildMembers: GuildMemberOption[], fallback?: string | null): string {
  const m = guildMembers.find((x) => x.userId === userId);
  return m?.name ?? fallback ?? userId.slice(0, 8);
}

function getDefaultTeamName(index: number) {
  return index === 0 ? "TEAM A" : index === 1 ? "TEAM B" : `TEAM ${index + 1}`;
}

const TEAM_COLORS = ["#00e7c2", "#ff4655", "#f6c945", "#a855f7", "#3b82f6"];

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
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newManagerId, setNewManagerId] = useState("");
  const [gameKda, setGameKda] = useState<Record<string, { k: string; d: string; a: string }>>({});

  const settings = useMemo(() => parseSettings(scrim?.settings), [scrim?.settings]);
  const teamNames = settings.teamNames ?? {};
  const teamIds = ["team_a", "team_b"];

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

  // 상태 변경 핸들러 (내전 시작/종료)
  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
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

  const patchScrim = useCallback(async (payload: unknown) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/scrim/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      const data = await res.json();
      if (data.scrim) setScrim(data.scrim);
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장에 실패했습니다."); }
    finally { setSaving(false); }
  }, [id]);

  const addRecruitment = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/scrim/${id}/recruitment`, { method: "POST" });
      if (!res.ok) throw new Error("모집 추가에 실패했습니다.");
      setMessage("모집 메시지가 발송되었습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "모집 추가에 실패했습니다."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>;
  if (!scrim) return <div className="val-card p-12 text-center text-[#7b8a96]">내전을 찾을 수 없습니다.</div>;

  if (scrim.mode === "auction") {
    return <AuctionScrimPage id={id} scrim={scrim} guildMembers={guildMembers} managerIds={managerIds} newManagerId={newManagerId} setNewManagerId={setNewManagerId} addManager={() => {}} saving={saving} message={message} setMessage={setMessage} onScrimUpdate={setScrim} addRecruitment={addRecruitment} />;
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    waiting: { label: "모집 대기", color: "#7b8a96" },
    recruiting: { label: "모집중", color: "#00e7c2" },
    playing: { label: "진행중", color: "#f6c945" },
    done: { label: "완료", color: "#ff4655" },
    finished: { label: "완료", color: "#ff4655" },
  };
  const statusInfo = STATUS_LABELS[scrim.status] ?? STATUS_LABELS.waiting;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">← 내전 목록</Link>
          <div className="mt-4 text-[10px] uppercase tracking-[0.32em] text-[#ff4655]">SCRIM ROOM</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black text-white">{scrim.title}</h1>
            <span className="rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-1 text-sm font-black text-[#ff8a95]">⚔ 일반 내전</span>
            <div className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-1 text-xs font-black" style={{ color: statusInfo.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
              {statusInfo.label}
            </div>
          </div>
          <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 내전 시작/종료 버튼 (모집 과정 이후 실제 경기 단계) */}
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
          
          <button type="button" onClick={() => {}} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40">🎲 랜덤 배정</button>
          <button type="button" onClick={() => {}} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40">⚖️ 밸런스</button>
          <button type="button" onClick={addRecruitment} disabled={saving} className="val-btn bg-[#ff4655] px-3 py-2 text-xs font-black text-white disabled:opacity-50">추가 모집</button>
          <button type="button" onClick={() => {}} className="val-btn border border-[#00e7c2]/40 bg-[#00e7c2]/10 px-3 py-2 text-xs font-black text-[#00e7c2] disabled:opacity-50">🔄 전적 자동 연동</button>
          <button type="button" onClick={() => setShowSettings(!showSettings)} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white">⚙️ 설정</button>
        </div>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="참가자" value={`${scrim.players.length}`} suffix="명" />
        <StatCard label="팀장" value={`${captainCount}`} suffix="명" />
        <StatCard label="팀원" value={`${memberCount}`} suffix="명" />
        <StatCard label="대기" value={`${participantPlayers.length}`} suffix="명" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="space-y-5">
          <section className="val-card p-5">
            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">참가자 목록</div>
            <div className="flex flex-wrap gap-2">
              {participantPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded bg-[#1d2732] p-2">
                  <span className="text-xs font-bold text-white">{p.user.name}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="val-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">경기 기록 ({games.length}경기)</div>
              {/* 수동 경기 추가 버튼 제거됨 */}
            </div>
            {games.length === 0 ? (
              <div className="rounded border border-dashed border-[#2a3540] py-8 text-center text-sm text-[#7b8a96]">
                내전이 시작되면 경기가 자동으로 기록됩니다.
              </div>
            ) : (
              <div className="space-y-3">
                {games.map((g) => (
                  <div key={g.id} className="rounded border border-[#2a3540] bg-[#0f1923]/70 p-3 text-xs font-black text-white">
                    {g.gameNumber}경기 · {g.map || "진행 중"}
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
        </aside>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="val-card flex flex-col items-center justify-center p-4 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#7b8a96]">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}<span className="ml-0.5 text-xs text-[#7b8a96]">{suffix}</span></div>
    </div>
  );
}

// ─── 경매 내전 전용 페이지 (간략화된 버전) ─────────────────────────────────────────────────────
function AuctionScrimPage({ id, scrim }: { id: string; scrim: ScrimDetail; [key: string]: any }) {
  return (
    <div className="mx-auto max-w-[1400px] p-12 text-center">
      <h1 className="text-2xl font-black text-white">경매 내전 모드</h1>
      <p className="mt-4 text-[#7b8a96]">경매 모드는 현재 준비 중입니다.</p>
      <Link href="/dashboard/scrim" className="mt-8 inline-block text-[#ff4655] font-black underline">목록으로 돌아가기</Link>
    </div>
  );
}
