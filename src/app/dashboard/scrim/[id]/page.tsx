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

interface GuildMemberOption {
  userId: string;
  discordId: string | null;
  name: string | null;
  image: string | null;
}

interface ScrimDetailSettings {
  teamNames?: Record<string, string>;
}

interface AuctionState {
  id: string;
  sessionId: string;
  phase: string; // setup | auction | reauction | done
  captainPoints: string; // JSON: { userId: points }
  queue: string; // JSON: userId[]
  currentUserId: string | null;
  currentBids: string; // JSON: { captainUserId: bidAmount }
  auctionStartAt: string | null;
  auctionDuration: number;
  failedQueue: string; // JSON: userId[]
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  Duelist: "타격대", Initiator: "척후대", Controller: "전략가", Sentinel: "감시자",
  duelist: "타격대", initiator: "척후대", controller: "전략가", sentinel: "감시자",
};
const TEAM_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const TEAM_COLORS = ["#00e7c2", "#ff4655", "#f6c945", "#9b7cff", "#4da3ff", "#ff8d4d", "#66e08a", "#d45bff"];

function getTeamId(index: number) { return `team_${TEAM_LETTERS[index].toLowerCase()}`; }
function getDefaultTeamName(index: number) { return `TEAM ${TEAM_LETTERS[index]}`; }
function parseAgents(value: string) {
  if (!value) return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : []; }
  catch { return value.split(",").map((x) => x.trim()).filter(Boolean); }
}
function formatDateTime(value: string | null) {
  if (!value) return "시작 시간 미정";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
function parseSettings(value: string | null | undefined): ScrimDetailSettings {
  if (!value) return {};
  try { const p = JSON.parse(value); return p && typeof p === "object" ? (p as ScrimDetailSettings) : {}; }
  catch { return {}; }
}
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function toRoleLabels(value: string | null) {
  if (!value) return [];
  return value.split(",").map((r) => r.trim()).filter(Boolean).map((r) => ROLE_LABELS[r] ?? r);
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
  const [newManagerId, setNewManagerId] = useState("");

  const settings = useMemo(() => parseSettings(scrim?.settings), [scrim?.settings]);
  const teamIds = useMemo(() => {
    const fromSettings = Object.keys(settings.teamNames ?? {}).filter((t) => t.startsWith("team_"));
    const fromPlayers = (scrim?.players ?? []).map((p) => p.team).filter((t) => t.startsWith("team_"));
    return Array.from(new Set([...fromSettings, ...fromPlayers, "team_a", "team_b"])).sort((a, b) => a.localeCompare(b));
  }, [scrim?.players, settings.teamNames]);
  const teamNames = useMemo(() => {
    const names = { ...(settings.teamNames ?? {}) };
    teamIds.forEach((t, i) => { if (!names[t]) names[t] = getDefaultTeamName(i); });
    return names;
  }, [settings.teamNames, teamIds]);

  const isTeamCaptain = useCallback((p: ScrimPlayer) => p.team.startsWith("team_") && p.role === "captain", []);
  const isTeamMember = useCallback((p: ScrimPlayer) => p.team.startsWith("team_") && p.role === "member", []);
  const participantPlayers = useMemo(
    () => (scrim?.players ?? []).filter((p) => !p.team.startsWith("team_") || p.role === "participant"),
    [scrim?.players]
  );
  const assignedPlayers = useMemo(
    () => (scrim?.players ?? []).filter((p) => isTeamCaptain(p) || isTeamMember(p)),
    [isTeamCaptain, isTeamMember, scrim?.players]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadScrim({ silent = false } = {}) {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/scrim/${id}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setScrim(data.scrim ?? null);
        setManagerIds(data.managerIds ?? []);
        setGuildMembers(data.guildMembers ?? []);
      } finally { if (!cancelled && !silent) setLoading(false); }
    }
    loadScrim();
    const timer = window.setInterval(() => loadScrim({ silent: true }), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [id]);

  async function patchScrim(payload: {
    players?: ScrimPlayer[];
    managerIds?: string[];
    settings?: ScrimDetailSettings;
    status?: string;
    winnerId?: string | null;
    map?: string;
    kdaPlayers?: { id: string; kills: number; deaths: number; assists: number }[];
    removePlayerId?: string;
    silent?: boolean;
  }) {
    if (!payload.silent) { setSaving(true); setMessage(null); }
    try {
      const res = await fetch(`/api/scrim/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: payload.players?.map((p) => ({ id: p.id, team: p.team, role: p.role })),
          managerIds: payload.managerIds,
          settings: payload.settings,
          status: payload.status,
          winnerId: payload.winnerId,
          map: payload.map,
          kdaPlayers: payload.kdaPlayers,
          removePlayerId: payload.removePlayerId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setScrim(data.scrim);
      if (payload.managerIds) setManagerIds(payload.managerIds);
      if (!payload.silent) setMessage("저장했습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장에 실패했습니다."); }
    finally { if (!payload.silent) setSaving(false); }
  }

  function movePlayer(playerId: string, team: string, role: string) {
    if (!scrim) return;
    const next = scrim.players.map((p) => (p.id === playerId ? { ...p, team, role } : p));
    setScrim({ ...scrim, players: next });
    void patchScrim({ players: next });
  }

  async function addRecruitment() {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/scrim", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "추가 모집 글 작성에 실패했습니다.");
      setMessage("추가 모집 글을 작성했습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "추가 모집 글 작성에 실패했습니다."); }
    finally { setSaving(false); }
  }

  function addManager() {
    if (!newManagerId || managerIds.includes(newManagerId) || managerIds.length >= 5) return;
    const next = [...managerIds, newManagerId];
    setManagerIds(next); void patchScrim({ managerIds: next }); setNewManagerId("");
  }

  function updateTeamName(teamId: string, name: string) {
    if (!scrim) return;
    const next = { ...settings, teamNames: { ...teamNames, [teamId]: name || teamNames[teamId] } };
    setScrim({ ...scrim, settings: JSON.stringify(next) }); void patchScrim({ settings: next });
  }

  function addTeam() {
    if (!scrim || teamIds.length >= TEAM_LETTERS.length) return;
    const nextId = getTeamId(teamIds.length);
    const next = { ...settings, teamNames: { ...teamNames, [nextId]: getDefaultTeamName(teamIds.length) } };
    setScrim({ ...scrim, settings: JSON.stringify(next) }); void patchScrim({ settings: next });
  }

  if (loading) return <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>;
  if (!scrim) return <div className="val-card p-12 text-center text-[#7b8a96]">내전을 찾을 수 없습니다.</div>;

  // 경매 내전이면 경매 전용 UI 렌더링
  if (scrim.mode === "auction") {
    return (
      <AuctionScrimPage
        scrim={scrim}
        guildMembers={guildMembers}
        managerIds={managerIds}
        newManagerId={newManagerId}
        setNewManagerId={setNewManagerId}
        addManager={addManager}
        saving={saving}
        message={message}
        setMessage={setMessage}
        onScrimUpdate={setScrim}
        addRecruitment={addRecruitment}
      />
    );
  }

  // 일반 내전 UI
  const captainCount = assignedPlayers.filter((p) => p.role === "captain").length;
  const memberCount = assignedPlayers.filter((p) => p.role === "member").length;

  // 내전 상태 레이블
  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    waiting: { label: "모집 대기", color: "#7b8a96" },
    recruiting: { label: "모집중", color: "#00e7c2" },
    playing: { label: "진행중", color: "#f6c945" },
    done: { label: "완료", color: "#ff4655" },
  };
  const VALORANT_MAPS = ["어센션", "바인드", "브리즈", "프락티스", "헤이븐", "로터스", "스플릿", "선셋", "아이스박스", "피카"];
  const statusInfo = STATUS_LABELS[scrim.status] ?? STATUS_LABELS.waiting;

  // 랜덤 팀 배정
  function randomAssign() {
    if (!scrim || participantPlayers.length < 2) return;
    const shuffled = [...participantPlayers].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const next = scrim.players.map((p) => {
      const idxA = shuffled.slice(0, half).findIndex((x) => x.id === p.id);
      const idxB = shuffled.slice(half).findIndex((x) => x.id === p.id);
      if (idxA >= 0) return { ...p, team: "team_a", role: idxA === 0 ? "captain" : "member" };
      if (idxB >= 0) return { ...p, team: "team_b", role: idxB === 0 ? "captain" : "member" };
      return p;
    });
    setScrim({ ...scrim, players: next });
    void patchScrim({ players: next, silent: true });
  }

  // 티어 기반 밸런스 배정
  function balanceAssign() {
    if (!scrim || participantPlayers.length < 2) return;
    const TIER_ORDER = ["Radiant", "Immortal 3", "Immortal 2", "Immortal 1", "Ascendant 3", "Ascendant 2", "Ascendant 1", "Diamond 3", "Diamond 2", "Diamond 1", "Platinum 3", "Platinum 2", "Platinum 1", "Gold 3", "Gold 2", "Gold 1", "Silver 3", "Silver 2", "Silver 1", "Bronze 3", "Bronze 2", "Bronze 1", "Iron 3", "Iron 2", "Iron 1"];
    const sorted = [...participantPlayers].sort((a, b) => {
      const ta = a.user.riotAccounts[0]?.cachedTierName ?? "";
      const tb = b.user.riotAccounts[0]?.cachedTierName ?? "";
      return (TIER_ORDER.indexOf(ta) === -1 ? 999 : TIER_ORDER.indexOf(ta)) - (TIER_ORDER.indexOf(tb) === -1 ? 999 : TIER_ORDER.indexOf(tb));
    });
    // 지그재그 방식으로 배분 (1위 팀A, 2위 팀B, 3위 팀B, 4위 팀A ...)
    const teamA: ScrimPlayer[] = [], teamB: ScrimPlayer[] = [];
    sorted.forEach((p, i) => {
      const cycle = Math.floor(i / 2);
      if (cycle % 2 === 0) { (i % 2 === 0 ? teamA : teamB).push(p); }
      else { (i % 2 === 0 ? teamB : teamA).push(p); }
    });
    const next = scrim.players.map((p) => {
      const idxA = teamA.findIndex((x) => x.id === p.id);
      const idxB = teamB.findIndex((x) => x.id === p.id);
      if (idxA >= 0) return { ...p, team: "team_a", role: idxA === 0 ? "captain" : "member" };
      if (idxB >= 0) return { ...p, team: "team_b", role: idxB === 0 ? "captain" : "member" };
      return p;
    });
    setScrim({ ...scrim, players: next });
    void patchScrim({ players: next, silent: true });
  }

  // 참가자 제거
  function removePlayer(playerId: string) {
    if (!scrim) return;
    setScrim({ ...scrim, players: scrim.players.filter((p) => p.id !== playerId) });
    void patchScrim({ removePlayerId: playerId, silent: true });
  }

  // 상태 전환
  function changeStatus(status: string) {
    if (!scrim) return;
    setScrim({ ...scrim, status });
    void patchScrim({ status, silent: true });
  }

  // 승패 기록
  function recordResult(winnerId: string | null) {
    if (!scrim) return;
    const next = { ...scrim, winnerId, status: winnerId !== null ? "done" : scrim.status };
    setScrim(next);
    void patchScrim({ winnerId, status: winnerId !== null ? "done" : undefined, silent: true });
  }

  // 맵 선택
  function selectMap(map: string) {
    if (!scrim) return;
    setScrim({ ...scrim, map });
    void patchScrim({ map, silent: true });
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">← 내전 목록</Link>
          <div className="mt-4 text-[10px] uppercase tracking-[0.32em] text-[#ff4655]">SCRIM ROOM</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black text-white">{scrim.title}</h1>
            <span className="rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-1 text-sm font-black text-[#ff8a95]">⚔ 일반 내전</span>
            <span className="rounded px-3 py-1 text-sm font-black" style={{ background: `${statusInfo.color}18`, color: statusInfo.color, border: `1px solid ${statusInfo.color}50` }}>{statusInfo.label}</span>
            {scrim.map && <span className="rounded bg-[#24313c] px-3 py-1 text-sm font-black text-[#c8d3db]">🗺 {scrim.map}</span>}
          </div>
          <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={randomAssign} disabled={saving || participantPlayers.length < 2} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40" title="참가자를 랜덤으로 두 팀에 배분">🎲 랜덤 배정</button>
          <button type="button" onClick={balanceAssign} disabled={saving || participantPlayers.length < 2} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40" title="티어 기반 밸런스 배정">⚖️ 밸런스</button>
          <button type="button" onClick={addTeam} disabled={saving} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-50">팀 추가</button>
          <button type="button" onClick={addRecruitment} disabled={saving} className="val-btn bg-[#ff4655] px-3 py-2 text-xs font-black text-white disabled:opacity-50">추가 모집</button>
        </div>
      </div>

      {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}

      {/* 상태 제어 바 */}
      <section className="val-card mb-5 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">내전 상태</div>
            <div className="flex gap-2">
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <button key={k} type="button" onClick={() => changeStatus(k)}
                  className={`rounded px-3 py-1.5 text-xs font-black transition-colors ${scrim.status === k ? "text-black" : "border border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/40"}`}
                  style={scrim.status === k ? { background: v.color } : {}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-8 w-px bg-[#2a3540]" />
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">맵</div>
            <div className="flex flex-wrap gap-1.5">
              {VALORANT_MAPS.map((m) => (
                <button key={m} type="button" onClick={() => selectMap(scrim.map === m ? "" : m)}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${scrim.map === m ? "bg-[#ff4655] text-white" : "border border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/40"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="h-8 w-px bg-[#2a3540]" />
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">승패 기록</div>
            <div className="flex gap-2">
              {[
                { id: "team_a", label: `${teamNames.team_a ?? "TEAM A"} 승리`, color: TEAM_COLORS[0] },
                { id: "team_b", label: `${teamNames.team_b ?? "TEAM B"} 승리`, color: TEAM_COLORS[1] },
                { id: "draw", label: "무승부", color: "#7b8a96" },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => recordResult(scrim.winnerId === opt.id ? null : opt.id)}
                  className={`rounded px-3 py-1.5 text-xs font-black transition-colors ${scrim.winnerId === opt.id ? "text-black" : "border border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/40"}`}
                  style={scrim.winnerId === opt.id ? { background: opt.color } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 통계 카드 */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="참가자" value={`${scrim.players.length}`} suffix="명" />
        <StatCard label="팀장" value={`${captainCount}`} suffix="명" />
        <StatCard label="팀원" value={`${memberCount}`} suffix="명" />
        <StatCard label="대기" value={`${participantPlayers.length}`} suffix="명" />
      </section>

      {scrim.description && (
        <section className="val-card mb-5 p-5">
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Description</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">{scrim.description}</p>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <TeamCaptainRail teamIds={teamIds} teamNames={teamNames} players={scrim.players} onDrop={(pId, tId) => movePlayer(pId, tId, "captain")} onRename={updateTeamName} />
        </aside>
        <main className="space-y-5">
          <DropArea title={`참가자 목록 (${participantPlayers.length}명)`} subtitle="드래그해서 팀장 또는 팀원 슬롯으로 바로 배치하세요." onDrop={(pId) => movePlayer(pId, "participant", "participant")}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {participantPlayers.map((p) => <PlayerCard key={p.id} player={p} compact onRemove={() => removePlayer(p.id)} />)}
              {participantPlayers.length === 0 && <EmptyState text="대기 중인 참가자가 없습니다." />}
            </div>
          </DropArea>
          <section className="grid gap-4 lg:grid-cols-2">
            {teamIds.map((tId, i) => {
              const captain = scrim.players.find((p) => p.team === tId && p.role === "captain");
              const members = scrim.players.filter((p) => p.team === tId && p.role === "member");
              return <TeamBoard key={tId} teamId={tId} name={teamNames[tId] ?? getDefaultTeamName(i)} color={TEAM_COLORS[i % TEAM_COLORS.length]} captain={captain} members={members} onDropCaptain={(pId) => movePlayer(pId, tId, "captain")} onDropMember={(pId) => movePlayer(pId, tId, "member")} onRename={(n) => updateTeamName(tId, n)} onRemove={removePlayer} />;
            })}
          </section>

          {/* KDA 입력 패널 */}
          {assignedPlayers.length > 0 && (
            <KdaPanel players={assignedPlayers} teamNames={teamNames} onSave={(kdaPlayers) => void patchScrim({ kdaPlayers })} />
          )}
        </main>
        <aside className="space-y-4">
          <ManagerPanel managerIds={managerIds} guildMembers={guildMembers} newManagerId={newManagerId} setNewManagerId={setNewManagerId} addManager={addManager} />
          <div className="val-card p-5 text-xs leading-relaxed text-[#9aa8b3]">
            <div className="mb-2 font-black text-white">사용 방법</div>
            <p>디스코드 모집 글에 아무 이모지를 누른 멤버가 참가자 목록에 자동 등록됩니다.</p>
            <p className="mt-2">참가자 카드를 드래그해서 팀장 또는 팀원 영역에 놓으면 즉시 화면에 반영되고 저장됩니다.</p>
            <p className="mt-2">랜덤 배정 버튼으로 참가자를 자동 배분하거나, 밸런스 버튼으로 티어 기반 균등 배분이 가능합니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── 경매 내전 전용 페이지 ─────────────────────────────────────────────────────
function AuctionScrimPage({
  scrim, guildMembers, managerIds, newManagerId, setNewManagerId, addManager,
  saving, message, setMessage, onScrimUpdate, addRecruitment,
}: {
  scrim: ScrimDetail;
  guildMembers: GuildMemberOption[];
  managerIds: string[];
  newManagerId: string;
  setNewManagerId: (v: string) => void;
  addManager: () => void;
  saving: boolean;
  message: string | null;
  setMessage: (v: string | null) => void;
  onScrimUpdate: (s: ScrimDetail) => void;
  addRecruitment: () => void;
}) {
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [auctionLoading, setAuctionLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // 설정 단계 상태
  const [captainSelections, setCaptainSelections] = useState<Record<string, number>>({}); // userId → points
  const [defaultPoints, setDefaultPoints] = useState(1000);
  const [timerSeconds, setTimerSeconds] = useState(30);

  // 입찰 상태
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({}); // captainId → input string
  const [bidding, setBidding] = useState(false);

  // 타이머
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/me/roles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => {});
  }, []);

  // 경매 상태 폴링
  useEffect(() => {
    let cancelled = false;
    async function poll(silent = false) {
      if (!silent) setAuctionLoading(true);
      try {
        const res = await fetch(`/api/scrim/auction?sessionId=${scrim.id}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setAuction(data.auction ?? null);
        // 낙찰/유찰 처리 후 scrim 플레이어 목록 갱신
        if (data.auction?.phase !== "setup") {
          const scrimRes = await fetch(`/api/scrim/${scrim.id}`, { cache: "no-store" });
          const scrimData = await scrimRes.json();
          if (!cancelled && scrimData.scrim) onScrimUpdate(scrimData.scrim);
        }
      } finally { if (!silent) setAuctionLoading(false); }
    }
    poll();
    const t = window.setInterval(() => poll(true), 3000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [scrim.id, onScrimUpdate]);

  // 타이머 카운트다운
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!auction?.auctionStartAt || (auction.phase !== "auction" && auction.phase !== "reauction")) {
      setTimeLeft(0); return;
    }
    function tick() {
      if (!auction?.auctionStartAt) return;
      const elapsed = (Date.now() - new Date(auction.auctionStartAt).getTime()) / 1000;
      const left = Math.max(0, auction.auctionDuration - elapsed);
      setTimeLeft(Math.ceil(left));
    }
    tick();
    timerRef.current = setInterval(tick, 200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auction?.auctionStartAt, auction?.auctionDuration, auction?.phase]);

  const captainPoints = parseJson<Record<string, number>>(auction?.captainPoints, {});
  const currentBids = parseJson<Record<string, number>>(auction?.currentBids, {});
  const failedQueue = parseJson<string[]>(auction?.failedQueue, []);
  const queue = parseJson<string[]>(auction?.queue, []);
  const captainIds = Object.keys(captainPoints);

  const playerMap = useMemo(() => {
    const m = new Map<string, ScrimPlayer>();
    scrim.players.forEach((p) => m.set(p.user.id, p));
    return m;
  }, [scrim.players]);

  const currentPlayer = auction?.currentUserId ? playerMap.get(auction.currentUserId) : null;

  // 팀장 선택 토글
  function toggleCaptain(userId: string) {
    setCaptainSelections((prev) => {
      const next = { ...prev };
      if (next[userId] !== undefined) { delete next[userId]; }
      else { next[userId] = defaultPoints; }
      return next;
    });
  }

  function setCaptainPoint(userId: string, points: number) {
    setCaptainSelections((prev) => ({ ...prev, [userId]: points }));
  }

  async function startAuction() {
    if (Object.keys(captainSelections).length < 2) {
      setMessage("팀장을 2명 이상 선택해야 합니다."); return;
    }
    setMessage(null);
    const res = await fetch("/api/scrim/auction", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: scrim.id, captainPoints: captainSelections, auctionDuration: timerSeconds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "경매 시작에 실패했습니다."); return; }
    setAuction(data.auction);
  }

  async function submitBid(captainId: string) {
    const amount = parseInt(bidAmounts[captainId] ?? "0", 10);
    if (!amount || amount <= 0) { setMessage("입찰 금액을 입력해 주세요."); return; }
    setBidding(true); setMessage(null);
    const res = await fetch("/api/scrim/auction", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: scrim.id, bidAmount: amount, captainId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "입찰에 실패했습니다."); }
    else { setAuction(data.auction); setBidAmounts((prev) => ({ ...prev, [captainId]: "" })); }
    setBidding(false);
  }

  async function resetAuction() {
    if (!window.confirm("경매를 초기화하고 처음부터 다시 시작할까요?")) return;
    const res = await fetch(`/api/scrim/auction?sessionId=${scrim.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "초기화에 실패했습니다."); return; }
    setAuction(null); setCaptainSelections({});
  }

  const timerPct = auction?.auctionDuration ? (timeLeft / auction.auctionDuration) * 100 : 0;
  const timerColor = timerPct > 50 ? "#00e7c2" : timerPct > 25 ? "#f6c945" : "#ff4655";

  // ── 설정 단계 ──
  if (!auction || auction.phase === "setup") {
    const participants = scrim.players.filter((p) => p.team === "participant" || p.role === "participant");
    return (
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">← 내전 목록</Link>
          <div className="mt-4 text-[10px] uppercase tracking-[0.32em] text-[#f6c945]">AUCTION SCRIM</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black text-white">{scrim.title}</h1>
            <span className="rounded border border-[#f6c945]/40 bg-[#f6c945]/10 px-3 py-1 text-sm font-black text-[#f6c945]">🏷 경매 내전</span>
          </div>
          <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {/* 경매 설정 */}
            {isAdmin && (
              <section className="val-card p-5">
                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#f6c945]">경매 설정</div>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-black text-[#9aa8b3]">팀장 기본 포인트</label>
                    <input
                      type="number" min={100} max={9999} step={50} value={defaultPoints}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); setDefaultPoints(v); setCaptainSelections((prev) => { const next = { ...prev }; Object.keys(next).forEach((k) => { next[k] = v; }); return next; }); }}
                      className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-black text-[#9aa8b3]">입찰 타이머 (초)</label>
                    <input
                      type="number" min={10} max={120} step={5} value={timerSeconds}
                      onChange={(e) => setTimerSeconds(parseInt(e.target.value, 10))}
                      className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                    />
                  </div>
                </div>
                <div className="mb-2 text-xs font-black text-white">팀장 선택 <span className="ml-1 text-[#7b8a96]">({Object.keys(captainSelections).length}명 선택됨)</span></div>
                <p className="mb-3 text-[11px] text-[#7b8a96]">팀장으로 지정할 참가자를 선택하고 각자의 초기 포인트를 설정하세요.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {participants.map((p) => {
                    const selected = captainSelections[p.user.id] !== undefined;
                    return (
                      <div key={p.id} className={`rounded border p-3 transition-colors ${selected ? "border-[#f6c945] bg-[#f6c945]/8" : "border-[#2a3540] bg-[#0f1923]/70"}`}>
                        <div className="flex items-center gap-2">
                          {p.user.image ? <img src={p.user.image} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-[#24313c]" />}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black text-white">{p.user.name ?? "이름 없음"}</div>
                            <div className="truncate text-[11px] text-[#7b8a96]">{p.user.riotAccounts[0] ? `${p.user.riotAccounts[0].gameName}#${p.user.riotAccounts[0].tagLine}` : "Riot 미연동"}</div>
                          </div>
                          <button type="button" onClick={() => toggleCaptain(p.user.id)} className={`rounded px-2 py-1 text-[11px] font-black transition-colors ${selected ? "bg-[#f6c945] text-black" : "bg-[#2a3540] text-[#9aa8b3] hover:bg-[#f6c945]/30"}`}>
                            {selected ? "✓ 팀장" : "선택"}
                          </button>
                        </div>
                        {selected && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-[11px] text-[#7b8a96]">포인트</label>
                            <input
                              type="number" min={100} max={9999} step={50} value={captainSelections[p.user.id]}
                              onChange={(e) => setCaptainPoint(p.user.id, parseInt(e.target.value, 10))}
                              className="w-24 rounded border border-[#2a3540] bg-[#0b141c] px-2 py-1 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                            />
                            <span className="text-[11px] text-[#7b8a96]">P</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={addRecruitment} disabled={saving} className="rounded border border-[#2a3540] bg-[#111c24] px-4 py-2 text-xs font-black text-white disabled:opacity-50">추가 모집</button>
                  <button type="button" onClick={startAuction} disabled={Object.keys(captainSelections).length < 2} className="val-btn bg-[#f6c945] px-5 py-2 text-sm font-black text-black disabled:opacity-40">
                    🏷 경매 시작
                  </button>
                </div>
              </section>
            )}

            {/* 참가자 목록 */}
            <section className="val-card p-5">
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">참가자 목록 ({participants.length}명)</div>
              {participants.length === 0
                ? <div className="rounded border border-dashed border-[#2a3540] py-8 text-center text-xs text-[#7b8a96]">아직 참가자가 없습니다. 디스코드 모집 글에 이모지를 달면 자동 등록됩니다.</div>
                : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{participants.map((p) => <PlayerCard key={p.id} player={p} compact />)}</div>
              }
            </section>
          </div>

          {/* 사이드바 */}
          <aside className="space-y-4">
            <ManagerPanel managerIds={managerIds} guildMembers={guildMembers} newManagerId={newManagerId} setNewManagerId={setNewManagerId} addManager={addManager} />
            <div className="val-card p-5 text-xs leading-relaxed text-[#9aa8b3]">
              <div className="mb-2 font-black text-[#f6c945]">경매 내전 진행 방법</div>
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>디스코드 모집 글에 이모지를 단 멤버가 참가자로 자동 등록됩니다.</li>
                <li>팀장 2명 이상을 선택하고 각자의 초기 포인트를 설정합니다.</li>
                <li>경매 시작 버튼을 누르면 참가자가 랜덤 순서로 1명씩 공개됩니다.</li>
                <li>팀장들이 타이머 내에 포인트를 입력해 입찰합니다.</li>
                <li>타이머 종료 시 최고가 팀장에게 낙찰됩니다.</li>
                <li>아무도 입찰하지 않으면 유찰 → 1차 종료 후 재경매됩니다.</li>
              </ol>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── 경매 진행 / 재경매 / 완료 단계 ──
  const phaseLabel = auction.phase === "reauction" ? "재경매" : auction.phase === "done" ? "경매 완료" : "경매 진행 중";
  const phaseColor = auction.phase === "done" ? "#00e7c2" : "#f6c945";

  // 팀별 배정 결과
  const teamAssignments: Record<string, ScrimPlayer[]> = {};
  captainIds.forEach((cId, i) => {
    const tId = `team_${String.fromCharCode(97 + i)}`;
    teamAssignments[tId] = scrim.players.filter((p) => p.team === tId);
  });

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">← 내전 목록</Link>
          <div className="mt-4 text-[10px] uppercase tracking-[0.32em]" style={{ color: phaseColor }}>AUCTION SCRIM · {phaseLabel}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black text-white">{scrim.title}</h1>
            <span className="rounded border border-[#f6c945]/40 bg-[#f6c945]/10 px-3 py-1 text-sm font-black text-[#f6c945]">🏷 경매 내전</span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" onClick={resetAuction} className="rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-4 py-2 text-xs font-black text-[#ff8a95] hover:border-[#ff4655]">경매 초기화</button>
          </div>
        )}
      </div>

      {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}

      {/* 현재 경매 중인 참가자 */}
      {(auction.phase === "auction" || auction.phase === "reauction") && (
        <div className="mb-5">
          {/* 타이머 바 */}
          <div className="mb-4 overflow-hidden rounded-full bg-[#1d2732]" style={{ height: 8 }}>
            <div className="h-full rounded-full transition-all duration-200" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
            {/* 현재 매물 */}
            <section className="val-card p-6">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f6c945]">
                  {auction.phase === "reauction" ? "🔄 재경매" : "현재 경매 매물"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#7b8a96]">남은 시간</span>
                  <span className="text-2xl font-black" style={{ color: timerColor }}>{timeLeft}s</span>
                </div>
              </div>
              <div className="mb-1 text-xs text-[#7b8a96]">
                대기 {queue.length}명 · 유찰 {failedQueue.length}명
              </div>

              {currentPlayer ? (
                <div className="mt-4 flex items-start gap-4">
                  {currentPlayer.user.image
                    ? <img src={currentPlayer.user.image} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    : <div className="h-20 w-20 rounded-lg bg-[#24313c]" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-black text-white">{currentPlayer.user.name ?? "이름 없음"}</div>
                    {currentPlayer.user.riotAccounts.map((a) => (
                      <div key={a.gameName} className="mt-1 text-sm text-[#9aa8b3]">
                        {a.region.toUpperCase()} · {a.gameName}#{a.tagLine}
                        {a.cachedTierName && <span className="ml-2 rounded bg-[#ff4655]/12 px-2 py-0.5 text-xs font-bold text-[#ff8a95]">{a.cachedTierName}</span>}
                      </div>
                    ))}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {toRoleLabels(currentPlayer.user.valorantRole).map((r) => (
                        <span key={r} className="rounded bg-[#24313c] px-2 py-0.5 text-[11px] font-bold text-[#c8d3db]">{r}</span>
                      ))}
                      {parseAgents(currentPlayer.user.favoriteAgents).slice(0, 3).map((a) => (
                        <span key={a} className="rounded bg-[#0b141c] px-2 py-0.5 text-[11px] font-bold text-[#9aa8b3]">{a}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 py-8 text-center text-[#7b8a96]">경매 대상자를 불러오는 중...</div>
              )}
            </section>

            {/* 팀장 입찰 패널 */}
            <section className="space-y-3">
              {captainIds.map((cId, i) => {
                const tId = `team_${String.fromCharCode(97 + i)}`;
                const captain = playerMap.get(cId);
                const myBid = currentBids[cId] ?? 0;
                const myPoints = captainPoints[cId] ?? 0;
                const color = TEAM_COLORS[i % TEAM_COLORS.length];
                const teamMembers = scrim.players.filter((p) => p.team === tId && (p.role === "member" || p.role === "captain"));

                return (
                  <div key={cId} className="val-card p-4" style={{ borderTop: `3px solid ${color}` }}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {captain?.user.image ? <img src={captain.user.image} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-[#24313c]" />}
                        <div>
                          <div className="text-sm font-black text-white">{captain?.user.name ?? "팀장"}</div>
                          <div className="text-[11px]" style={{ color }}>{getDefaultTeamName(i)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-white">{myPoints.toLocaleString()}<span className="ml-1 text-xs text-[#7b8a96]">P</span></div>
                        {myBid > 0 && <div className="text-xs font-bold text-[#f6c945]">입찰: {myBid}P</div>}
                      </div>
                    </div>
                    <div className="mb-2 text-[11px] text-[#7b8a96]">팀원 {teamMembers.length - 1}명 배정됨</div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <input
                          type="number" min={1} max={myPoints} placeholder="입찰 금액"
                          value={bidAmounts[cId] ?? ""}
                          onChange={(e) => setBidAmounts((prev) => ({ ...prev, [cId]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") void submitBid(cId); }}
                          className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                        />
                        <button type="button" onClick={() => void submitBid(cId)} disabled={bidding} className="rounded bg-[#f6c945] px-3 py-2 text-xs font-black text-black disabled:opacity-50">입찰</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        </div>
      )}

      {/* 경매 완료 결과 */}
      {auction.phase === "done" && (
        <div className="mb-5 val-card p-5">
          <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#00e7c2]">🎉 경매 완료 · 팀 구성 결과</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {captainIds.map((cId, i) => {
              const tId = `team_${String.fromCharCode(97 + i)}`;
              const color = TEAM_COLORS[i % TEAM_COLORS.length];
              const members = scrim.players.filter((p) => p.team === tId);
              const remainPoints = captainPoints[cId] ?? 0;
              return (
                <div key={cId} className="rounded border border-[#2a3540] overflow-hidden">
                  <div className="px-4 py-3" style={{ borderTop: `3px solid ${color}`, background: "#1d2732" }}>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white" style={{ color }}>{getDefaultTeamName(i)}</span>
                      <span className="text-xs text-[#7b8a96]">잔여 {remainPoints}P</span>
                    </div>
                  </div>
                  <div className="divide-y divide-[#2a3540]">
                    {members.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-4 py-2">
                        {p.user.image ? <img src={p.user.image} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-[#24313c]" />}
                        <span className="flex-1 truncate text-sm font-bold text-white">{p.user.name ?? "이름 없음"}</span>
                        {p.role === "captain" && <span className="rounded bg-[#f6c945]/15 px-2 py-0.5 text-[10px] font-black text-[#f6c945]">팀장</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 포인트 현황 (진행 중일 때) */}
      {(auction.phase === "auction" || auction.phase === "reauction") && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
          {captainIds.map((cId, i) => {
            const captain = playerMap.get(cId);
            const color = TEAM_COLORS[i % TEAM_COLORS.length];
            const tId = `team_${String.fromCharCode(97 + i)}`;
            const memberCount = scrim.players.filter((p) => p.team === tId && p.role === "member").length;
            return (
              <div key={cId} className="val-card p-4" style={{ borderTop: `3px solid ${color}` }}>
                <div className="text-xs font-black" style={{ color }}>{getDefaultTeamName(i)}</div>
                <div className="mt-1 text-sm font-bold text-white truncate">{captain?.user.name ?? "팀장"}</div>
                <div className="mt-2 text-2xl font-black text-white">{(captainPoints[cId] ?? 0).toLocaleString()}<span className="ml-1 text-xs text-[#7b8a96]">P</span></div>
                <div className="mt-1 text-[11px] text-[#7b8a96]">팀원 {memberCount}명</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 유찰 목록 */}
      {failedQueue.length > 0 && auction.phase !== "done" && (
        <div className="val-card mb-5 p-4">
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">유찰 대기 ({failedQueue.length}명)</div>
          <div className="flex flex-wrap gap-2">
            {failedQueue.map((uid) => {
              const p = playerMap.get(uid);
              return (
                <div key={uid} className="flex items-center gap-1.5 rounded border border-[#2a3540] bg-[#0f1923]/70 px-2 py-1">
                  {p?.user.image ? <img src={p.user.image} alt="" className="h-5 w-5 rounded-full object-cover" /> : <div className="h-5 w-5 rounded-full bg-[#24313c]" />}
                  <span className="text-xs font-bold text-[#9aa8b3]">{p?.user.name ?? uid}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────────────────────
function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="val-card p-5">
      <div className="text-xs font-black text-[#7b8a96]">{label}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-4xl font-black text-[#7fffe6]">{value}</span>
        <span className="pb-1 text-sm font-bold text-[#c8d3db]">{suffix}</span>
      </div>
    </div>
  );
}

function DropArea({ title, subtitle, children, onDrop }: { title: string; subtitle?: string; children: React.ReactNode; onDrop: (playerId: string) => void }) {
  return (
    <section className="val-card p-5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id); }}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-xs font-bold text-[#7b8a96]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function TeamCaptainRail({ teamIds, teamNames, players, onDrop, onRename }: { teamIds: string[]; teamNames: Record<string, string>; players: ScrimPlayer[]; onDrop: (playerId: string, teamId: string) => void; onRename: (teamId: string, name: string) => void }) {
  return (
    <div className="val-card p-4">
      <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Team Captains</div>
      <div className="space-y-3">
        {teamIds.map((tId, i) => {
          const captain = players.find((p) => p.team === tId && p.role === "captain");
          return (
            <div key={tId} className="rounded border border-[#2a3540] bg-[#0f1923]/80 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, tId); }}>
              <input defaultValue={teamNames[tId] ?? getDefaultTeamName(i)} onBlur={(e) => onRename(tId, e.target.value.trim())} className="mb-2 w-full rounded border border-[#384653] bg-[#111c24] px-2 py-1 text-xs font-black text-white outline-none focus:border-[#ff4655]" />
              {captain ? <PlayerCard player={captain} compact /> : <EmptyState text="팀장 슬롯" small />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamBoard({ teamId, name, color, captain, members, onDropCaptain, onDropMember, onRename, onRemove }: { teamId: string; name: string; color: string; captain?: ScrimPlayer; members: ScrimPlayer[]; onDropCaptain: (id: string) => void; onDropMember: (id: string) => void; onRename: (name: string) => void; onRemove?: (id: string) => void }) {
  return (
    <article className="val-card overflow-hidden">
      <div className="border-b border-[#2a3540] bg-[#1d2732] px-5 py-4" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <input defaultValue={name} onBlur={(e) => onRename(e.target.value.trim())} className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none" />
          <span className="rounded border border-[#2a3540] px-2 py-1 text-[11px] font-black text-[#7b8a96]">{members.length + (captain ? 1 : 0)}명</span>
        </div>
      </div>
      <div className="grid gap-4 p-4">
        <DropAreaMini label="팀장" onDrop={onDropCaptain}>{captain ? <PlayerCard player={captain} onRemove={onRemove ? () => onRemove(captain.id) : undefined} /> : <EmptyState text="팀장 배치" />}</DropAreaMini>
        <DropAreaMini label="팀원" onDrop={onDropMember}>
          <div className="grid gap-2">
            {members.map((p) => <PlayerCard key={p.id} player={p} onRemove={onRemove ? () => onRemove(p.id) : undefined} />)}
            {members.length === 0 && <EmptyState text="팀원 배치" />}
          </div>
        </DropAreaMini>
      </div>
      <span className="sr-only">{teamId}</span>
    </article>
  );
}

function DropAreaMini({ label, children, onDrop }: { label: string; children: React.ReactNode; onDrop: (id: string) => void }) {
  return (
    <div className="rounded border border-dashed border-[#33414e] bg-[#0b141c]/60 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id); }}>
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#7b8a96]">{label}</div>
      {children}
    </div>
  );
}

function PlayerCard({ player, compact = false, onRemove }: { player: ScrimPlayer; compact?: boolean; onRemove?: () => void }) {
  const riotNames = player.user.riotAccounts.map((a) => `${a.region.toUpperCase()} · ${a.gameName}#${a.tagLine}`);
  const tiers = player.user.riotAccounts.map((a) => a.cachedTierName).filter(Boolean);
  const agents = parseAgents(player.user.favoriteAgents);
  const roleLabels = toRoleLabels(player.user.valorantRole);
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", player.id); }} className="cursor-grab rounded border border-[#2a3540] bg-[#111c24] px-3 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition hover:border-[#7fffe6]/60 active:cursor-grabbing">
      <div className="flex items-center gap-3">
        {player.user.image ? <img src={player.user.image} alt="" className={compact ? "h-9 w-9 rounded-full object-cover" : "h-12 w-12 rounded object-cover"} /> : <div className={compact ? "h-9 w-9 rounded-full bg-[#24313c]" : "h-12 w-12 rounded bg-[#24313c]"} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-white">{player.user.name ?? "이름 없음"}</div>
          <div className="truncate text-[11px] text-[#7b8a96]">{riotNames.join(" · ") || "Riot 계정 미연동"}</div>
        </div>
        {onRemove && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-1 flex-shrink-0 rounded p-1 text-[#7b8a96] hover:bg-[#ff4655]/20 hover:text-[#ff4655]" title="참가자 제거">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {tiers.slice(0, 2).map((t) => <span key={t} className="rounded bg-[#ff4655]/12 px-2 py-0.5 font-bold text-[#ff8a95]">{t}</span>)}
        {roleLabels.map((r) => <span key={r} className="rounded bg-[#24313c] px-2 py-0.5 font-bold text-[#c8d3db]">{r}</span>)}
        {agents.slice(0, 3).map((a) => <span key={a} className="rounded bg-[#0b141c] px-2 py-0.5 font-bold text-[#9aa8b3]">{a}</span>)}
      </div>
    </div>
  );
}

function EmptyState({ text, small = false }: { text: string; small?: boolean }) {
  return <div className={`rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 text-center text-xs text-[#7b8a96] ${small ? "px-2 py-3" : "px-3 py-8"}`}>{text}</div>;
}

function ManagerPanel({ managerIds, guildMembers, newManagerId, setNewManagerId, addManager }: { managerIds: string[]; guildMembers: GuildMemberOption[]; newManagerId: string; setNewManagerId: (v: string) => void; addManager: () => void }) {
  return (
    <div className="val-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-white">내전 관리자</h2>
        <span className="text-xs text-[#7b8a96]">{managerIds.length}/5</span>
      </div>
      <div className="mb-3 flex flex-col gap-2">
        {managerIds.map((mid) => {
          const m = guildMembers.find((x) => x.discordId === mid || x.userId === mid);
          return (
            <div key={mid} className="flex items-center gap-2 rounded border border-[#2a3540] bg-[#0f1923]/70 px-2 py-2">
              {m?.image ? <img src={m.image} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-[#24313c]" />}
              <span className="min-w-0 flex-1 truncate text-xs font-black text-white">{m?.name ?? mid}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <select value={newManagerId} onChange={(e) => setNewManagerId(e.target.value)} className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-xs font-bold text-white outline-none">
          <option value="">관리자 선택</option>
          {guildMembers.map((m) => <option key={m.userId} value={m.discordId ?? m.userId}>{m.name}</option>)}
        </select>
        <button type="button" onClick={addManager} disabled={managerIds.length >= 5} className="rounded bg-[#ff4655] px-3 py-2 text-xs font-black text-white disabled:opacity-50">추가</button>
      </div>
    </div>
  );
}

// ─── KDA 입력 패널 ──────────────────────────────────────────────────────────────
function KdaPanel({
  players, teamNames, onSave,
}: {
  players: ScrimPlayer[];
  teamNames: Record<string, string>;
  onSave: (kdaPlayers: { id: string; kills: number; deaths: number; assists: number }[]) => void;
}) {
  const [kda, setKda] = useState<Record<string, { kills: string; deaths: string; assists: string }>>(() => {
    const init: Record<string, { kills: string; deaths: string; assists: string }> = {};
    players.forEach((p) => {
      init[p.id] = {
        kills: p.kills != null ? String(p.kills) : "",
        deaths: p.deaths != null ? String(p.deaths) : "",
        assists: p.assists != null ? String(p.assists) : "",
      };
    });
    return init;
  });
  const [saved, setSaved] = useState(false);

  function update(id: string, field: "kills" | "deaths" | "assists", val: string) {
    setKda((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
    setSaved(false);
  }

  function handleSave() {
    const result = players.map((p) => ({
      id: p.id,
      kills: parseInt(kda[p.id]?.kills ?? "0", 10) || 0,
      deaths: parseInt(kda[p.id]?.deaths ?? "0", 10) || 0,
      assists: parseInt(kda[p.id]?.assists ?? "0", 10) || 0,
    }));
    onSave(result);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // 팀별로 그룹핑
  const teams = Array.from(new Set(players.map((p) => p.team))).sort();

  return (
    <section className="val-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">KDA 기록</div>
          <p className="mt-0.5 text-[11px] font-bold text-[#7b8a96]">팀 배치 완료 후 각 플레이어의 킬/데스/어시스트를 입력하세요.</p>
        </div>
        <button
          type="button" onClick={handleSave}
          className={`rounded px-4 py-2 text-xs font-black transition-colors ${saved ? "bg-[#00e7c2] text-black" : "bg-[#ff4655] text-white hover:bg-[#e03040]"}`}>
          {saved ? "저장됨 ✓" : "KDA 저장"}
        </button>
      </div>
      <div className="space-y-4">
        {teams.map((tId, ti) => {
          const teamPlayers = players.filter((p) => p.team === tId);
          const color = TEAM_COLORS[ti % TEAM_COLORS.length];
          return (
            <div key={tId}>
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em]" style={{ color }}>{teamNames[tId] ?? getDefaultTeamName(ti)}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2a3540]">
                      <th className="pb-2 text-left font-black text-[#7b8a96]">플레이어</th>
                      <th className="pb-2 w-20 text-center font-black text-[#7b8a96]">K</th>
                      <th className="pb-2 w-20 text-center font-black text-[#7b8a96]">D</th>
                      <th className="pb-2 w-20 text-center font-black text-[#7b8a96]">A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1d2732]">
                    {teamPlayers.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            {p.user.image ? <img src={p.user.image} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-[#24313c]" />}
                            <span className="font-bold text-white truncate max-w-[120px]">{p.user.name ?? "이름 없음"}</span>
                            {p.role === "captain" && <span className="rounded bg-[#f6c945]/15 px-1.5 py-0.5 text-[10px] font-black text-[#f6c945]">C</span>}
                          </div>
                        </td>
                        {(["kills", "deaths", "assists"] as const).map((field) => (
                          <td key={field} className="py-2 px-1">
                            <input
                              type="number" min={0} max={99}
                              value={kda[p.id]?.[field] ?? ""}
                              onChange={(e) => update(p.id, field, e.target.value)}
                              className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-2 py-1 text-center font-black text-white outline-none focus:border-[#ff4655]"
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
