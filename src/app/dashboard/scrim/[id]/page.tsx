"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

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
  kdSummary: {
    source: "scrim" | "rank";
    kd: number;
    kills: number;
    deaths: number;
    matches: number;
  } | null;
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
  teamSnapshot: string; // JSON: { team_a: userId[], team_b: userId[] }
  kdaSnapshot: string;  // JSON: [{ userId, kills, deaths, assists }]
  roundResults: any; // JSON: [{ round, result, winner, plant, defuse }] - Prisma가 이미 파싱된 객체로 반환할 수 있음
  playedAt: string | null;
  createdAt: string;
}

interface GuildMemberOption {
  userId: string;
  discordId: string | null;
  name: string | null;
  image: string | null;
}

interface AgentOption {
  name: string;
  icon: string | null;
  portrait: string | null;
}

interface ScrimDetailSettings {
  teamNames?: Record<string, string>;
  useTeamBoard?: boolean;
  useCaptain?: boolean;
  showRiotNickname?: boolean;
  showDiscordNickname?: boolean;
  showRankTier?: boolean;
  showValorantRole?: boolean;
  showFavoriteAgents?: boolean;
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

// ─── 전적탭 동일 헬퍼 함수 ────────────────────────────────────────────────────
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

function normalizeTierNameLocal(name: string | null | undefined, tierId?: number): string {
  if (tierId && tierId > 0) {
    const map: Record<number, string> = {
      0: "언랭크", 1: "아이언 1", 2: "아이언 2", 3: "아이언 3",
      4: "브론즈 1", 5: "브론즈 2", 6: "브론즈 3",
      7: "실버 1", 8: "실버 2", 9: "실버 3",
      10: "골드 1", 11: "골드 2", 12: "골드 3",
      13: "플래티넘 1", 14: "플래티넘 2", 15: "플래티넘 3",
      16: "다이아몬드 1", 17: "다이아몬드 2", 18: "다이아몬드 3",
      19: "초월자 1", 20: "초월자 2", 21: "초월자 3",
      22: "불멸 1", 23: "불멸 2", 24: "불멸 3",
      25: "레디언트",
    };
    if (map[tierId]) return map[tierId];
  }
  if (!name) return "언랭크";
  return name;
}

type RoundWinType = "defuse" | "spike" | "time" | "surrender" | "elimination";
function roundWinType(result: string, ceremony?: string): RoundWinType {
  const text = `${result} ${ceremony ?? ""}`.toLowerCase();
  if (text.includes("defus")) return "defuse";
  if (text.includes("deton") || text.includes("explode") || text.includes("spike") || text.includes("bomb")) return "spike";
  if (text.includes("time") || text.includes("timeout")) return "time";
  if (text.includes("surrender") || text.includes("forfeit")) return "surrender";
  return "elimination";
}
function roundWinLabel(type: RoundWinType) {
  if (type === "defuse") return "스파이크 해체";
  if (type === "spike") return "스파이크 폭발";
  if (type === "time") return "시간 승리";
  if (type === "surrender") return "항복";
  return "전멸";
}
function RoundResultIcon({ type }: { type: RoundWinType }) {
  if (type === "spike") return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M12 2 6.8 8.4l2.1 2.2L12 6.8l3.1 3.8 2.1-2.2L12 2Z" />
      <path fill="currentColor" d="M8.4 11.3h7.2l1.1 7.7L12 22l-4.7-3 1.1-7.7Zm2.5 2.1-.5 4.4 1.6 1 1.6-1-.5-4.4h-2.2Z" />
    </svg>
  );
  if (type === "defuse") return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M12 2 7 8.2l2.1 2.1L12 6.8l2.9 3.5L17 8.2 12 2Z" opacity="0.55" />
      <path fill="currentColor" d="M6.2 11.5h11.6v2.1H6.2v-2.1Zm2 4h7.6v2.1H8.2v-2.1Z" />
      <path fill="currentColor" d="M18.9 4.3 21 6.4 7.1 20.3 5 18.2 18.9 4.3Z" />
    </svg>
  );
  if (type === "time") return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M7 2h10v5.2L13.8 12l3.2 4.8V22H7v-5.2l3.2-4.8L7 7.2V2Zm2.5 2.4v2.1l2.5 3.7 2.5-3.7V4.4h-5Zm2.5 9.4-2.5 3.7v2.1h5v-2.1L12 13.8Z" />
    </svg>
  );
  if (type === "surrender") return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M5 3h2.4v18H5V3Zm4 1.5h9.5l-2.3 4L18.5 12H9V4.5Z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M4.7 3.2 2.8 5.1l5.8 5.8-4 4v3.5h3.5l4-4 6 6 1.9-1.9L4.7 3.2Z" />
      <path fill="currentColor" d="m19.3 3.2 1.9 1.9-5.8 5.8 4 4v3.5h-3.5L2.8 5.1l1.9-1.9 11.2 11.2 1.7-1.7-4-4 5.7-5.5Z" />
    </svg>
  );
}

function ScrimScoreboardPortrait({ cardIcon, agentIcon, agent, level }: { cardIcon?: string; agentIcon?: string; agent?: string; level?: number | null }) {
  // cardIcon = 플레이어 카드(smallart), agentIcon = killfeedportrait(초상화)
  const primary = cardIcon || agentIcon;
  return (
    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[#2a3540] ring-1 ring-white/10">
      {primary ? (
        <>
          <img src={primary} alt={agent} className="h-full w-full object-cover object-top" />
          <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/80 to-transparent" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#7b8a96]" aria-hidden="true">
            <path fill="currentColor" d="M12 12.4a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.1c-4.2 0-7.5 2.1-7.5 4.6V21h15v-1.9c0-2.5-3.3-4.6-7.5-4.6Z" />
          </svg>
        </div>
      )}
      {level != null && (
        <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[9px] font-bold text-white">{level}</span>
      )}
    </div>
  );
}

function ScrimScoreboardTable({
  players, label, accent,
}: {
  players: Array<{ userId: string; name: string; tag?: string; kills: number; deaths: number; assists: number; acs: number; plusMinus: number; kd: number; hsPercent: number; adr: number | null; tierId: number; tierName: string; tierIcon?: string; agentPortrait?: string; agentCard?: string; agentName?: string; agent?: string; level?: number | null }>;
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
          <tr className={headerClass}>
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
          {sorted.map((player, index) => (
            <tr key={player.userId}
              className={`border-b border-[#0e1821] ${
                index % 2 === 0 ? "bg-[#101c26]" : "bg-[#192633]"
              }`}>
              <td className="py-2 pl-3">
                <div className="flex items-center gap-2">
                  <ScrimScoreboardPortrait
                    cardIcon={player.agentCard}
                    agentIcon={player.agentPortrait}
                    agent={player.agentName ?? player.agent}
                    level={player.level}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-black text-white">{player.name}</span>
                      {player.tag && <span className="rounded bg-[#263544] px-1 text-[10px] text-[#b8c6d1]">#{player.tag}</span>}
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {/* 요원 이름 옆 아이콘: displayicon(작은 아이콘) 사용 */}
                      {player.agentPortrait && <img src={player.agentPortrait.replace('killfeedportrait.png', 'displayicon.png')} alt={player.agentName ?? player.agent} className="h-3 w-3 rounded object-cover" />}
                      <span className="truncate text-[#8da0ad]">{player.agentName ?? player.agent}</span>
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
                  <span className={`truncate text-[11px] font-bold ${tierColor(player.tierId)}`}>{normalizeTierNameLocal(player.tierName, player.tierId)}</span>
                </div>
              </td>
              <td className="bg-[#24384a] px-2 py-2 text-center text-base font-black text-white">{player.acs}</td>
              <td className="px-2 py-2 text-center text-base font-bold text-white">{player.kills}</td>
              <td className="px-2 py-2 text-center text-base font-bold text-[#ff4655]">{player.deaths}</td>
              <td className="px-2 py-2 text-center text-base font-bold text-white">{player.assists}</td>
              <td className={`px-2 py-2 text-center text-base font-black ${
                player.plusMinus > 0 ? "text-green-400" : player.plusMinus < 0 ? "text-[#ff4655]" : "text-[#8da0ad]"
              }`}>{player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}</td>
              <td className={`px-2 py-2 text-center text-base font-black ${
                player.kd >= 1 ? "text-green-400" : "text-[#ff4655]"
              }`}>{player.kd.toFixed(1)}</td>
              <td className="px-2 py-2 text-center font-bold text-white">{player.hsPercent}%</td>
              <td className="px-2 py-2 text-center font-bold text-white">{player.adr ?? "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase();
}
function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
function parseSettings(value: string | null | undefined): ScrimDetailSettings {
  const fallback: ScrimDetailSettings = {
    useTeamBoard: true, useCaptain: true,
    showRiotNickname: true, showDiscordNickname: true, showRankTier: true,
    showValorantRole: true, showFavoriteAgents: true,
  };
  if (!value) return fallback;
  try {
    const p = JSON.parse(value);
    if (p && typeof p === "object") return { ...fallback, ...(p as ScrimDetailSettings) };
    return fallback;
  }
  catch { return fallback; }
}
function parseJson<T>(value: any, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  // Prisma $queryRawUnsafe는 JSON 콼럼을 이미 파싱된 객체로 반환함
  if (typeof value !== "string") return value as T;
  if (value === "") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function toRoleLabels(value: string | null) {
  if (!value) return [];
  return value.split(",").map((r) => r.trim()).filter(Boolean).map((r) => ROLE_LABELS[r] ?? r);
}

// ─── 서버닉 헬퍼 ─────────────────────────────────────────────────────────────
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
  const [newManagerId, setNewManagerId] = useState("");
  const [games, setGames] = useState<ScrimGame[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameKda, setGameKda] = useState<Record<string, Record<string, number>>>({});

  const settings = useMemo(() => parseSettings(scrim?.settings), [scrim?.settings]);
  const [showSettings, setShowSettings] = useState(false);

  // 더미 데이터 모달 상태
  const [dummyOpen, setDummyOpen] = useState(false);
  const [dummyAdding, setDummyAdding] = useState(false);
  const DUMMY_ROLES = ["감시자", "타격대", "척후대", "전략가"];
  const TIER_OPTIONS = [
    { label: "언랭크", id: 0 }, { label: "아이언 1", id: 1 }, { label: "아이언 2", id: 2 }, { label: "아이언 3", id: 3 },
    { label: "브론즈 1", id: 4 }, { label: "브론즈 2", id: 5 }, { label: "브론즈 3", id: 6 },
    { label: "실버 1", id: 7 }, { label: "실버 2", id: 8 }, { label: "실버 3", id: 9 },
    { label: "골드 1", id: 10 }, { label: "골드 2", id: 11 }, { label: "골드 3", id: 12 },
    { label: "플래티넘 1", id: 13 }, { label: "플래티넘 2", id: 14 }, { label: "플래티넘 3", id: 15 },
    { label: "다이아몬드 1", id: 16 }, { label: "다이아몬드 2", id: 17 }, { label: "다이아몬드 3", id: 18 },
    { label: "초월자 1", id: 19 }, { label: "초월자 2", id: 20 }, { label: "초월자 3", id: 21 },
    { label: "불멸 1", id: 22 }, { label: "불멸 2", id: 23 }, { label: "불멸 3", id: 24 },
    { label: "레디언트", id: 25 },
  ];
  type DummyRow = { discordName: string; riotId: string; tierId: number; valorantRole: string; favoriteAgents: string };
  const emptyRow = (): DummyRow => ({ discordName: "", riotId: "", tierId: 0, valorantRole: "", favoriteAgents: "" });
  const [dummyRows, setDummyRows] = useState<DummyRow[]>(() => [emptyRow()]);

  function setDummyRow(index: number, patch: Partial<DummyRow>) {
    setDummyRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submitDummy() {
    if (dummyAdding) return;
    const players = dummyRows
      .filter((row) => row.discordName.trim())
      .map((row) => ({
        discordName: row.discordName.trim(),
        riotId: row.riotId.trim() || undefined,
        cachedTierName: TIER_OPTIONS.find((t) => t.id === row.tierId)?.label,
        cachedTierId: row.tierId,
        valorantRole: row.valorantRole || undefined,
        favoriteAgents: row.favoriteAgents ? row.favoriteAgents.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }));
    if (players.length === 0) { setMessage("디스코드 이름을 입력해 주세요."); return; }
    setDummyAdding(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${id}/dummy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "더미 추가에 실패했습니다.");
      setMessage(`더미 참가자 ${data.added?.length ?? 0}명 추가됨.`);
      setDummyOpen(false);
      setDummyRows([emptyRow()]);
      const reloadRes = await fetch(`/api/scrim/${id}`, { cache: "no-store" });
      const reloadData = await reloadRes.json();
      setScrim(reloadData.scrim ?? null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "더미 추가에 실패했습니다."); }
    finally { setDummyAdding(false); }
  }

  async function updateSettings(updates: Partial<ScrimDetailSettings>) {
    if (!scrim) return;
    const next = { ...settings, ...updates };
    setScrim({ ...scrim, settings: JSON.stringify(next) });
    void patchScrim({ settings: next });
  }
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

  const handleStatusChange = async (newStatus: string) => {
    if (!scrim) return;
    try {
      const res = await fetch(`/api/scrim/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || '상태 업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('상태 업데이트 오류:', error);
      alert('오류가 발생했습니다.');
    }
  };

  const refreshScrim = useCallback(async () => {
    const res = await fetch(`/api/scrim/${id}`, { cache: "no-store" });
    const data = await res.json();
    setScrim(data.scrim ?? null);
    setManagerIds(data.managerIds ?? []);
    setGuildMembers(data.guildMembers ?? []);
  }, [id]);

  const refreshGames = useCallback(async () => {
    const res = await fetch(`/api/scrim/${id}/games`, { cache: "no-store" });
    const data = await res.json();
    setGames(data.games ?? []);
  }, [id]);

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
    // 폴링 간격을 실시간 WebSocket으로 대체 (5초 → 30초)
    const timer = window.setInterval(() => loadScrim({ silent: true }), 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [id]);

  // 경기 목록 로드
  useEffect(() => {
    refreshGames().catch(() => {});
  }, [refreshGames]);

  // 실시간 업데이트
  useRealtime(`scrim:${id}`, () => {
    refreshScrim().catch(() => {});
    refreshGames().catch(() => {});
  });

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

  async function loadReactions() {
    if (!scrim?.recruitmentChannelId) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-reactions" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "참가자 로드에 실패했습니다.");
      if (data.scrim) setScrim(data.scrim);
      setMessage("이모지 반응자를 참가자로 로드했습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "참가자 로드에 실패했습니다."); }
    finally { setSaving(false); }
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
  const VALORANT_MAPS = ["어센트", "바인드", "헤이븐", "스플릿", "아이스박스", "프랙처", "펄", "로터스", "선셋", "어비스"];
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

  // ─── 경기 관리 함수 ───────────────────────────────────────────────────────────
  async function addGame() {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${id}/games`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "경기 추가에 실패했습니다.");
      const newGame: ScrimGame = data.game;
      setGames((prev) => [...prev, newGame]);
      setActiveGameId(newGame.id);
      setMessage(`${newGame.gameNumber}경기가 추가됐습니다.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "경기 추가에 실패했습니다."); }
    finally { setSaving(false); }
  }

  async function patchGame(gameId: string, payload: { map?: string; winnerId?: string | null; matchId?: string | null; kdaSnapshot?: unknown[] }) {
    try {
      const res = await fetch(`/api/scrim/${id}/games`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      const updated: ScrimGame = data.game;
      setGames((prev) => prev.map((g) => (g.id === gameId ? updated : g)));
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장에 실패했습니다."); }
  }

  async function deleteGame(gameId: string) {
    if (!confirm("이 경기 기록을 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/scrim/${id}/games`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "삭제에 실패했습니다.");
      setGames((prev) => {
        const next = prev.filter((g) => g.id !== gameId).map((g, i) => ({ ...g, gameNumber: i + 1 }));
        return next;
      });
      if (activeGameId === gameId) setActiveGameId(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "삭제에 실패했습니다."); }
    finally { setSaving(false); }
  }

  async function syncGameMatch(gameId: string) {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${id}/sync-match`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "전적 연동에 실패했습니다.");
      // 경기 목록 새로고침
      const gRes = await fetch(`/api/scrim/${id}/games`, { cache: "no-store" });
      const gData = await gRes.json();
      setGames(gData.games ?? []);
      setMessage(data.message ?? "전적 자동 연동 완료!");
    } catch (e) { setMessage(e instanceof Error ? e.message : "전적 연동에 실패했습니다."); }
    finally { setSaving(false); }
  }

  // 전적 자동 연동
  async function syncMatch() {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${id}/sync-match`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "전적 연동에 실패했습니다.");
      setMessage(data.message ?? "전적 자동 연동 완료!");
      // 내전 데이터 + 경기 목록 함께 리로드
      const [reloadRes, gRes] = await Promise.all([
        fetch(`/api/scrim/${id}`, { cache: "no-store" }),
        fetch(`/api/scrim/${id}/games`, { cache: "no-store" }),
      ]);
      const [reloadData, gData] = await Promise.all([reloadRes.json(), gRes.json()]);
      if (reloadData.scrim) setScrim(reloadData.scrim);
      const refreshedGames: ScrimGame[] = gData.games ?? [];
      setGames(refreshedGames);
      // 연동된 경기를 자동으로 활성화
      if (data.matchId) {
        const linked = refreshedGames.find((g) => g.matchId === data.matchId);
        if (linked) setActiveGameId(linked.id);
      } else if (refreshedGames.length > 0) {
        setActiveGameId(refreshedGames[refreshedGames.length - 1].id);
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "전적 연동에 실패했습니다."); }
    finally { setSaving(false); }
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
          </div>
          {formatDateTime(scrim.scheduledAt) && (
            <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={randomAssign} disabled={saving || participantPlayers.length < 2} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40" title="참가자를 랜덤으로 두 팀에 배분">🎲 랜덤 배정</button>
          <button type="button" onClick={balanceAssign} disabled={saving || participantPlayers.length < 2} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-40" title="티어 기반 밸런스 배정">⚖️ 밸런스</button>
          <button type="button" onClick={addTeam} disabled={saving} className="val-btn border border-[#2a3540] bg-[#111c24] px-3 py-2 text-xs font-black text-white disabled:opacity-50">팀 추가</button>
          <button type="button" onClick={addRecruitment} disabled={saving} className="val-btn border border-[#ff4655]/40 bg-[#ff4655]/10 px-3 py-2 text-xs font-black text-[#ff4655] disabled:opacity-50">추가 모집</button>
          {scrim.recruitmentChannelId && (
            <button type="button" onClick={() => void loadReactions()} disabled={saving} className="val-btn border border-[#00e7c2]/40 bg-[#00e7c2]/10 px-3 py-2 text-xs font-black text-[#00e7c2] disabled:opacity-50" title="Discord 이모지 반응자를 참가자로 불러옵니다">
              👥 참가자 로드
            </button>
          )}
          <button type="button" onClick={() => void syncMatch()} disabled={saving} className="val-btn border border-[#00e7c2]/40 bg-[#00e7c2]/10 px-3 py-2 text-xs font-black text-[#00e7c2] disabled:opacity-50" title="참가자 전원이 포함된 커스텀 매치를 자동으로 찾아 승패/맵/KDA를 기록합니다">🔄 전적 자동 연동</button>
          <button type="button" onClick={() => { setDummyRows([emptyRow()]); setDummyOpen(true); }} className="val-btn border border-[#f6c945]/40 bg-[#f6c945]/10 px-3 py-2 text-xs font-black text-[#f6c945]" title="테스트용 더미 참가자 추가">🧪 더미 데이터</button>
          <button type="button" onClick={() => setShowSettings(!showSettings)} className={`val-btn border border-[#2a3540] px-3 py-2 text-xs font-black transition-colors ${showSettings ? "bg-[#ff4655] text-white" : "bg-[#111c24] text-white"}`}>⚙️ 설정</button>
        </div>
      </div>

      {showSettings && (
        <div className="mb-6 rounded border border-[#2a3540] bg-[#0f1923] p-4 shadow-xl">
          <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-[#ff4655]">ROOM SETTINGS</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded bg-[#111c24] p-3">
              <div>
                <div className="text-sm font-black text-white">팀 배치 기능</div>
                <div className="text-[10px] text-[#7b8a96]">팀A / 팀B 보드를 활성화하고 참가자를 배정합니다.</div>
              </div>
              <button type="button" onClick={() => void updateSettings({ useTeamBoard: !settings.useTeamBoard })}
                className={`relative h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${settings.useTeamBoard ? "bg-[#00e7c2]" : "bg-[#2a3540]"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${settings.useTeamBoard ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded bg-[#111c24] p-3">
              <div>
                <div className="text-sm font-black text-white">팀장 기능</div>
                <div className="text-[10px] text-[#7b8a96]">팀별로 팀장 슬롯을 활성화합니다.</div>
              </div>
              <button type="button" onClick={() => void updateSettings({ useCaptain: !settings.useCaptain })}
                className={`relative h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${settings.useCaptain ? "bg-[#00e7c2]" : "bg-[#2a3540]"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${settings.useCaptain ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}



      {/* 통계 카드 */}
      <section className={`mb-5 grid gap-3 sm:grid-cols-2 ${settings.useTeamBoard ? (settings.useCaptain ? "md:grid-cols-4" : "md:grid-cols-3") : "md:grid-cols-2"}`}>
        <StatCard label="참가자" value={`${scrim.players.length}`} suffix="명" />
        {settings.useTeamBoard && settings.useCaptain && <StatCard label="팀장" value={`${captainCount}`} suffix="명" />}
        {settings.useTeamBoard && <StatCard label="팀원" value={`${memberCount}`} suffix="명" />}
        <StatCard label={settings.useTeamBoard ? "대기" : "참가자 목록"} value={`${participantPlayers.length}`} suffix="명" />
      </section>

      {scrim.description && (
        <section className="val-card mb-5 p-5">
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Description</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">{scrim.description}</p>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="space-y-5">
          <DropArea title={`${settings.useTeamBoard ? "참가자 목록" : "전체 참가자"} (${participantPlayers.length}명)`} 
            subtitle={settings.useTeamBoard ? "드래그해서 팀장 또는 팀원 슬롯으로 바로 배치하세요." : "내전에 참여 중인 플레이어 목록입니다."} 
            onDrop={(pId) => movePlayer(pId, "participant", "participant")}>
            <ParticipantList players={participantPlayers} guildMembers={guildMembers} onRemove={removePlayer} settings={settings} />
          </DropArea>
          
          {settings.useTeamBoard && (
            <section className="grid gap-4 lg:grid-cols-2">
              {teamIds.map((tId, i) => {
                const captain = settings.useCaptain ? scrim.players.find((p) => p.team === tId && p.role === "captain") : undefined;
                const members = scrim.players.filter((p) => p.team === tId && (settings.useCaptain ? p.role === "member" : true));
                return <TeamBoard key={tId} teamId={tId} name={teamNames[tId] ?? getDefaultTeamName(i)} color={TEAM_COLORS[i % TEAM_COLORS.length]} 
                  captain={captain} members={members} 
                  onDropCaptain={settings.useCaptain ? (pId) => movePlayer(pId, tId, "captain") : undefined} 
                  onDropMember={(pId) => movePlayer(pId, tId, settings.useCaptain ? "member" : "participant")} 
                  onRename={(n) => updateTeamName(tId, n)} onRemove={removePlayer} guildMembers={guildMembers} settings={settings} />;
              })}
            </section>
          )}

          {/* KDA 입력 패널 */}
          {assignedPlayers.length > 0 && (
            <KdaPanel players={assignedPlayers} teamNames={teamNames} onSave={(kdaPlayers) => void patchScrim({ kdaPlayers })} guildMembers={guildMembers} />
          )}

          {/* 경기 기록 섹션 */}
          <section className="val-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">경기 기록 ({games.length}경기)</div>

            </div>

            {games.length === 0 && (
              <div className="rounded border border-dashed border-[#2a3540] py-8 text-center text-sm text-[#7b8a96]">
                아직 기록된 경기가 없습니다. 내전을 시작하고 경기를 진행하세요.
              </div>
            )}

            {/* 경기 탭 */}
            {games.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {games.map((g) => (
                    <button key={g.id} type="button"
                      onClick={() => setActiveGameId(activeGameId === g.id ? null : g.id)}
                      className={`rounded px-3 py-1.5 text-xs font-black transition-colors ${
                        activeGameId === g.id
                          ? g.winnerId === "team_a" ? "bg-[#00e7c2] text-black"
                            : g.winnerId === "team_b" ? "bg-[#ff4655] text-white"
                            : g.winnerId === "draw" ? "bg-[#7b8a96] text-white"
                            : "bg-[#f6c945] text-black"
                          : "border border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/40"
                      }`}>
                      {g.gameNumber}경기
                      {g.winnerId === "team_a" && " ✓A"}
                      {g.winnerId === "team_b" && " ✓B"}
                      {g.winnerId === "draw" && " ="}
                      {g.map && ` · ${g.map}`}
                    </button>
                  ))}
                </div>

                {/* 선택된 경기 상세 */}
                {activeGameId && (() => {
                  const game = games.find((g) => g.id === activeGameId);
                  if (!game) return null;
                  const kdaData = parseJson<Array<{ userId: string; kills: number; deaths: number; assists: number; team: string; agent: string; score: number; name: string; agentPortrait?: string; agentCard?: string; cardIcon?: string; agentName?: string; tierName?: string; tierIcon?: string; currentTier?: number; teamRoundsWon?: number }>>(game.kdaSnapshot, []);
                  const teamSnap = parseJson<Record<string, string[]>>(game.teamSnapshot, {});

                  return (
                    <div className="rounded border border-[#2a3540] bg-[#0a1520] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-black text-white">{game.gameNumber}경기</div>
                        <button type="button" onClick={() => void deleteGame(game.id)}
                          className="text-xs text-[#7b8a96] hover:text-[#ff4655]">삭제</button>
                      </div>

                      {/* 맵/승패: 매치 미연동 시에만 수동 입력 표시 */}
                      {!game.matchId && (
                        <>
                          <div>
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">맵</div>
                            <div className="flex flex-wrap gap-1.5">
                              {VALORANT_MAPS.map((m) => (
                                <button key={m} type="button"
                                  onClick={() => void patchGame(game.id, { map: game.map === m ? undefined : m })}
                                  className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
                                    game.map === m ? "bg-[#ff4655] text-white" : "border border-[#2a3540] bg-[#111c24] text-[#9aa8b3] hover:border-[#ff4655]/40"
                                  }`}>
                                  {m}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">승패</div>
                            <div className="flex gap-2">
                              {[
                                { id: "team_a", label: `${teamNames.team_a ?? "TEAM A"} 승리`, color: TEAM_COLORS[0] },
                                { id: "team_b", label: `${teamNames.team_b ?? "TEAM B"} 승리`, color: TEAM_COLORS[1] },
                                { id: "draw", label: "무승부", color: "#7b8a96" },
                              ].map((opt) => (
                                <button key={opt.id} type="button"
                                  onClick={() => void patchGame(game.id, { winnerId: game.winnerId === opt.id ? null : opt.id })}
                                  className={`rounded px-3 py-1.5 text-xs font-black transition-colors ${
                                    game.winnerId === opt.id ? "text-black" : "border border-[#2a3540] bg-[#111c24] text-[#9aa8b3] hover:border-[#ff4655]/40"
                                  }`}
                                  style={game.winnerId === opt.id ? { background: opt.color } : {}}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* 전적 자동 연동 */}
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => void syncGameMatch(game.id)} disabled={saving}
                          className="val-btn border border-[#00e7c2]/40 bg-[#00e7c2]/10 px-3 py-1.5 text-xs font-black text-[#00e7c2] disabled:opacity-50">
                          🔄 전적 자동 연동
                        </button>
                        {game.matchId && (
                          <span className="text-xs text-[#00e7c2]">✓ 매치 연동됨 ({game.matchId.slice(0, 8)}...)</span>
                        )}
                      </div>

                      {/* 매치 연동 시: 전적탭 MatchDetailScoreboard와 동일한 UI */}
                      {game.matchId && kdaData.length > 0 ? (
                        <div>
                          {/* 헤더: 맵 + 스코어 (전적탭 bg-[#2a4054] 스타일) */}
                          {(() => {
                            const blueRounds = kdaData.find(k => k.team === "Blue")?.teamRoundsWon ?? 0;
                            const redRounds = kdaData.find(k => k.team === "Red")?.teamRoundsWon ?? 0;
                            return (
                              <div className="bg-[#2a4054] px-4 py-3 mb-0">
                                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                                  <div>
                                    <div className="text-[11px] font-bold text-[#9fb0be]">{game.map ?? ""}</div>
                                  </div>
                                  <div className="flex items-end gap-3 text-lg font-black">
                                    <span className="text-[#58ffd8]">Team A</span>
                                    <span className="text-[#58ffd8]">{blueRounds}</span>
                                    <span className="text-white">:</span>
                                    <span className="text-[#ff5f75]">{redRounds}</span>
                                    <span className="text-[#ff5f75]">Team B</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Scoreboard 탭 헤더 (전적탭 동일) */}
                          <div className="border-b border-[#0e1821] bg-[#2a4054] text-sm font-bold text-white mb-0">
                            <div className="inline-flex min-w-[140px] justify-center border-b-2 border-[#ff4655] py-3">Scoreboard</div>
                          </div>
                          {/* 라운드 타임라인 (전적탭 bg-[#07131e] 스타일) */}
                          {(() => {
                            const roundData = parseJson<Array<{ round: number; result: string; winner: string; plant: boolean; defuse: boolean }>>(game.roundResults, []);
                            const myTeamId = "Blue"; // Blue = Team A
                            if (roundData.length === 0) {
                              return (
                                <div className="bg-[#07131e] px-3 py-4 text-center text-xs text-[#6f8291]">
                                  라운드 데이터를 불러오는 중...
                                </div>
                              );
                            }
                            return (
                              <div className="bg-[#07131e] px-3 py-4">
                                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
                                  {/* Team A 행 */}
                                  <div className="whitespace-nowrap text-right text-sm font-bold text-[#58ffd8]">Team A</div>
                                  <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(roundData.length, 1), 26)}, minmax(0, 1fr))` }}>
                                    {roundData.map((round) => {
                                      const isMyRound = round.winner === myTeamId;
                                      const type = roundWinType(round.result);
                                      return (
                                        <div key={`team-a-${round.round}`}
                                          className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${
                                            isMyRound ? "text-[#58ffd8]" : "text-[#263544]"
                                          }`}
                                          title={`${round.round}R ${isMyRound ? roundWinLabel(type) : ""} ${round.result}`}>
                                          {isMyRound ? <RoundResultIcon type={type} /> : <span className="text-lg font-black leading-none">·</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* Team B 행 */}
                                  <div className="whitespace-nowrap text-right text-sm font-bold text-[#ff5f75]">Team B</div>
                                  <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(roundData.length, 1), 26)}, minmax(0, 1fr))` }}>
                                    {roundData.map((round) => {
                                      const isEnemyRound = round.winner === "Red";
                                      const type = roundWinType(round.result);
                                      return (
                                        <div key={`team-b-${round.round}`}
                                          className={`flex h-5 min-w-0 items-center justify-center rounded-sm leading-none ${
                                            isEnemyRound ? "text-[#ff5f75]" : "text-[#263544]"
                                          }`}
                                          title={`${round.round}R ${isEnemyRound ? roundWinLabel(type) : ""} ${round.result}`}>
                                          {isEnemyRound ? <RoundResultIcon type={type} /> : <span className="text-lg font-black leading-none">·</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* 라운드 번호 행 */}
                                  <div className="whitespace-nowrap" />
                                  <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(roundData.length, 1), 26)}, minmax(0, 1fr))` }}>
                                    {roundData.map((round) => (
                                      <div key={`num-${round.round}`} className="flex h-4 min-w-0 items-center justify-center text-[9px] text-[#8da0ad]">
                                        {round.round}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {/* 범례 (전적탭 동일) */}
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[58px] text-[10px] text-[#6f8291]">
                                  {(["elimination", "spike", "defuse", "time"] as const).map((type) => (
                                    <span key={type} className="inline-flex items-center gap-1">
                                      <RoundResultIcon type={type} />
                                      {roundWinLabel(type)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* 스코어보드 테이블 (전적탭 ScoreboardTable 동일) */}
                          {(() => {
                            const blueRounds = kdaData.find(k => k.team === "Blue")?.teamRoundsWon ?? 0;
                            const redRounds = kdaData.find(k => k.team === "Red")?.teamRoundsWon ?? 0;
                            const totalRounds = (blueRounds + redRounds) > 0 ? (blueRounds + redRounds) : Math.max(13, Math.round(Math.max(...kdaData.map(k => k.score), 1) / 400));
                            const blueWon = blueRounds > redRounds;
                            // kdaData → ScrimScoreboardTable 형식으로 변환
                            const toTablePlayers = (teamColor: string) => kdaData
                              .filter(k => k.team === teamColor)
                              .map(k => {
                                const player = scrim.players.find(p => p.user.id === k.userId);
                                const serverNick = resolveServerNick(k.userId, guildMembers, player?.user.name);
                                const riotAcc = player?.user.riotAccounts?.[0];
                                const tag = riotAcc?.tagLine ?? "";
                                const acs = Math.round(k.score / Math.max(totalRounds, 1));
                                const kd = k.deaths > 0 ? k.kills / k.deaths : k.kills;
                                const plusMinus = k.kills - k.deaths;
                                return {
                                  userId: k.userId,
                                  name: serverNick,
                                  tag,
                                  kills: k.kills,
                                  deaths: k.deaths,
                                  assists: k.assists,
                                  acs,
                                  plusMinus,
                                  kd,
                                  hsPercent: 0,
                                  adr: null as number | null,
                                  tierId: k.currentTier ?? 0,
                                  tierName: k.tierName ?? "",
                                  tierIcon: k.tierIcon,
                                  // agentCard = 플레이어 카드(cardIcon), agentPortrait = killfeedportrait(초상화)
                                  agentCard: k.cardIcon || k.agentCard,
                                  agentPortrait: k.agentPortrait,
                                  agentName: k.agentName ?? k.agent,
                                  agent: k.agent,
                                  level: null as number | null,
                                };
                              });
                            const blueLabel = `Team A · ${blueRounds}R`;
                            const redLabel = `Team B · ${redRounds}R`;
                            return (
                              <>
                                <ScrimScoreboardTable players={toTablePlayers("Blue")} label={blueLabel} accent={blueWon ? "green" : "red"} />
                                <ScrimScoreboardTable players={toTablePlayers("Red")} label={redLabel} accent={blueWon ? "red" : "green"} />
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        /* 미연동 시: 기존 팀 구성 스냅샷 + KDA 입력 */
                        <>
                          {Object.keys(teamSnap).length > 0 && (
                            <div>
                              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">경기 당시 팀 구성</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {Object.entries(teamSnap).map(([tId], ti) => {
                                  const tName = teamNames[tId] ?? `TEAM ${tId.replace("team_", "").toUpperCase()}`;
                                  const tColor = TEAM_COLORS[ti % TEAM_COLORS.length];
                                  const userIds = teamSnap[tId] ?? [];
                                  return (
                                    <div key={tId} className="rounded border p-2" style={{ borderColor: `${tColor}40` }}>
                                      <div className="mb-1 text-xs font-black" style={{ color: tColor }}>{tName}</div>
                                      <div className="space-y-1">
                                        {userIds.map((uid) => {
                                          const p = scrim.players.find((x) => x.user.id === uid);
                                          const kda = kdaData.find((k) => k.userId === uid);
                                          return (
                                            <div key={uid} className="flex items-center justify-between text-xs text-[#c8d3db]">
                                              <span>{resolveServerNick(uid, guildMembers, p?.user.name) ?? uid.slice(0, 8)}</span>
                                              {kda && <span className="text-[#9aa8b3]">{kda.kills}/{kda.deaths}/{kda.assists}</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {assignedPlayers.length > 0 && (
                            <GameKdaPanel
                              game={game}
                              players={assignedPlayers}
                              teamNames={teamNames}
                              gameKda={gameKda}
                              setGameKda={setGameKda}
                              onSave={(kda) => void patchGame(game.id, { kdaSnapshot: kda })}
                              guildMembers={guildMembers}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
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

      {/* 더미 데이터 모달 */}
      {dummyOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4">
          <div className="val-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">🧪 더미 데이터 추가</h2>
                <p className="mt-0.5 text-xs text-[#7b8a96]">테스트용 가상 참가자를 추가합니다. 디스코드 이름이 같으면 기존 유저로 처리됩니다.</p>
              </div>
              <button type="button" onClick={() => setDummyOpen(false)}
                className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-xs font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white">
                닫기
              </button>
            </div>

            <div className="space-y-3">
              {dummyRows.map((row, index) => (
                <div key={index} className="rounded border border-[#2a3540] bg-[#0b141c] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-black text-[#7b8a96]">참가자 {index + 1}</span>
                    {dummyRows.length > 1 && (
                      <button type="button" onClick={() => setDummyRows((prev) => prev.filter((_, i) => i !== index))}
                        className="text-[11px] text-[#ff4655] hover:text-white">삭제</button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">디스코드 이름 <span className="text-[#ff4655]">*</span></label>
                      <input value={row.discordName} onChange={(e) => setDummyRow(index, { discordName: e.target.value })}
                        placeholder="예: 플레이어닉네임"
                        className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">라이엇 ID</label>
                      <input value={row.riotId} onChange={(e) => setDummyRow(index, { riotId: e.target.value })}
                        placeholder="예: 닉네임#KR1"
                        className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 font-mono text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">티어</label>
                      <select value={row.tierId} onChange={(e) => setDummyRow(index, { tierId: Number(e.target.value) })}
                        className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]">
                        {TIER_OPTIONS.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">역할군</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DUMMY_ROLES.map((role) => (
                          <button key={role} type="button"
                            onClick={() => setDummyRow(index, { valorantRole: row.valorantRole === role ? "" : role })}
                            className={`rounded px-2.5 py-1 text-xs font-black transition-colors ${row.valorantRole === role ? "bg-[#f6c945] text-[#0b141c]" : "border border-[#2a3540] bg-[#111c24] text-[#9aa8b3] hover:border-[#f6c945]/50"}`}>
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">모스트 3 요원 <span className="font-normal text-[#56636f]">(쉼표로 구분, 예: 제트,오멘,레이나)</span></label>
                      <input value={row.favoriteAgents} onChange={(e) => setDummyRow(index, { favoriteAgents: e.target.value })}
                        placeholder="예: 제트,오멘,레이나"
                        className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setDummyRows((prev) => [...prev, emptyRow()])}
              disabled={dummyRows.length >= 20}
              className="mt-3 w-full rounded border border-dashed border-[#2a3540] py-2 text-xs font-black text-[#7b8a96] hover:border-[#f6c945]/50 hover:text-[#f6c945] disabled:opacity-40">
              + 참가자 추가
            </button>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDummyOpen(false)}
                className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-5 py-2 text-sm font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white">
                취소
              </button>
              <button type="button" onClick={() => void submitDummy()} disabled={dummyAdding}
                className="val-btn bg-[#f6c945] px-5 py-2 text-sm font-black text-[#0b141c] disabled:opacity-50">
                {dummyAdding ? "추가 중..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
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

  const auctionSettings = useMemo(() => parseSettings(scrim.settings), [scrim.settings]);

  // 에이전트 초상화
  const [agentPortraits, setAgentPortraits] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/valorant/agents", { cache: "force-cache" })
      .then((r) => r.ok ? r.json() : null)
      .then((payload: { agents?: AgentOption[] } | null) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const agent of payload?.agents ?? []) {
          const image = agent.portrait || agent.icon;
          if (agent.name && image) next[normalizeAgentKey(agent.name)] = image;
        }
        setAgentPortraits(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 설정 단계 상태
  const [captainSelections, setCaptainSelections] = useState<Record<string, number>>({}); // userId → points
  const [defaultPoints, setDefaultPoints] = useState(1000);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [timerEnabled, setTimerEnabled] = useState(true);

  // 입찰 상태
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({}); // captainId → input string
  const [bidding, setBidding] = useState(false);

  // 타이머
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 더미 데이터
  const [dummyOpen, setDummyOpen] = useState(false);
  const [dummyAdding, setDummyAdding] = useState(false);
  const AUCTION_DUMMY_ROLES = ["감시자", "타격대", "척후대", "전략가"];
  const AUCTION_TIER_OPTIONS = [
    { label: "언랭크", id: 0 }, { label: "아이언 1", id: 1 }, { label: "아이언 2", id: 2 }, { label: "아이언 3", id: 3 },
    { label: "브론즈 1", id: 4 }, { label: "브론즈 2", id: 5 }, { label: "브론즈 3", id: 6 },
    { label: "실버 1", id: 7 }, { label: "실버 2", id: 8 }, { label: "실버 3", id: 9 },
    { label: "골드 1", id: 10 }, { label: "골드 2", id: 11 }, { label: "골드 3", id: 12 },
    { label: "플래티넘 1", id: 13 }, { label: "플래티넘 2", id: 14 }, { label: "플래티넘 3", id: 15 },
    { label: "다이아몬드 1", id: 16 }, { label: "다이아몬드 2", id: 17 }, { label: "다이아몬드 3", id: 18 },
    { label: "초월자 1", id: 19 }, { label: "초월자 2", id: 20 }, { label: "초월자 3", id: 21 },
    { label: "불멸 1", id: 22 }, { label: "불멸 2", id: 23 }, { label: "불멸 3", id: 24 },
    { label: "레디언트", id: 25 },
  ];
  type AuctionDummyRow = { discordName: string; riotId: string; tierId: number; valorantRole: string; favoriteAgents: string };
  const auctionEmptyRow = (): AuctionDummyRow => ({ discordName: "", riotId: "", tierId: 0, valorantRole: "", favoriteAgents: "" });
  const [dummyRows, setDummyRows] = useState<AuctionDummyRow[]>(() => [auctionEmptyRow()]);

  function setDummyRow(index: number, patch: Partial<AuctionDummyRow>) {
    setDummyRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submitDummy() {
    if (dummyAdding) return;
    const players = dummyRows
      .filter((row) => row.discordName.trim())
      .map((row) => ({
        discordName: row.discordName.trim(),
        riotId: row.riotId.trim() || undefined,
        cachedTierName: AUCTION_TIER_OPTIONS.find((t) => t.id === row.tierId)?.label,
        cachedTierId: row.tierId,
        valorantRole: row.valorantRole || undefined,
        favoriteAgents: row.favoriteAgents ? row.favoriteAgents.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }));
    if (players.length === 0) { setMessage("디스코드 이름을 입력해 주세요."); return; }
    setDummyAdding(true); setMessage(null);
    try {
      const res = await fetch(`/api/scrim/${scrim.id}/dummy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "더미 추가에 실패했습니다.");
      setMessage(`더미 참가자 ${data.added?.length ?? 0}명 추가됨.`);
      setDummyOpen(false);
      setDummyRows([auctionEmptyRow()]);
      const reloadRes = await fetch(`/api/scrim/${scrim.id}`, { cache: "no-store" });
      const reloadData = await reloadRes.json();
      if (reloadData.scrim) onScrimUpdate(reloadData.scrim);
    } catch (e) { setMessage(e instanceof Error ? e.message : "더미 추가에 실패했습니다."); }
    finally { setDummyAdding(false); }
  }

  useEffect(() => {
    fetch("/api/me/roles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => {});
  }, []);

  // 경매 상태 폴링
  const pollAuction = useCallback(async (silent = false) => {
    if (!silent) setAuctionLoading(true);
    try {
      const res = await fetch(`/api/scrim/auction?sessionId=${scrim.id}`, { cache: "no-store" });
      const data = await res.json();
      setAuction(data.auction ?? null);
      if (data.auction?.phase !== "setup") {
        const scrimRes = await fetch(`/api/scrim/${scrim.id}`, { cache: "no-store" });
        const scrimData = await scrimRes.json();
        if (scrimData.scrim) onScrimUpdate(scrimData.scrim);
      }
    } finally { if (!silent) setAuctionLoading(false); }
  }, [scrim.id, onScrimUpdate]);

  useEffect(() => {
    let cancelled = false;
    pollAuction().catch(() => {});
    const t = window.setInterval(() => { if (!cancelled) pollAuction(true).catch(() => {}); }, 3000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [pollAuction]);

  useRealtime(`scrim:${scrim.id}`, () => { pollAuction(true).catch(() => {}); });

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
      body: JSON.stringify({ sessionId: scrim.id, captainPoints: captainSelections, auctionDuration: timerEnabled ? timerSeconds : 0 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "경매 시작에 실패했습니다."); return; }
    setAuction(data.auction);
  }

  async function manualResolve() {
    setMessage(null);
    const res = await fetch("/api/scrim/auction", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: scrim.id, action: "resolve" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "처리에 실패했습니다."); return; }
    setAuction(data.auction);
  }

  async function manualPass() {
    if (!window.confirm("이 참가자를 유찰 처리하시겠습니까?")) return;
    setMessage(null);
    const res = await fetch("/api/scrim/auction", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: scrim.id, action: "pass" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "처리에 실패했습니다."); return; }
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

  async function removePlayer(playerId: string) {
    const res = await fetch(`/api/scrim/${scrim.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removePlayerId: playerId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.scrim) onScrimUpdate(data.scrim);
    else setMessage(data.error ?? "참가자 제거에 실패했습니다.");
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
          {formatDateTime(scrim.scheduledAt) && (
            <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
          )}
        </div>
        {message && <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">{message}</div>}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {/* 경매 설정 */}
            {isAdmin && (
              <section className="val-card p-5">
                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#f6c945]">경매 설정</div>
                <div className="mb-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-black text-[#9aa8b3]">팀장 기본 포인트</label>
                    <input
                      type="number" min={100} max={9999} step={50} value={defaultPoints}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); setDefaultPoints(v); setCaptainSelections((prev) => { const next = { ...prev }; Object.keys(next).forEach((k) => { next[k] = v; }); return next; }); }}
                      className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-black text-[#9aa8b3]">입찰 타이머</label>
                    <button
                      type="button"
                      onClick={() => setTimerEnabled((v) => !v)}
                      className={`relative mt-0.5 h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${timerEnabled ? "bg-[#00e7c2]" : "bg-[#2a3540]"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${timerEnabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  {timerEnabled && (
                    <div>
                      <label className="mb-1.5 block text-xs font-black text-[#9aa8b3]">타이머 시간 (초)</label>
                      <input
                        type="number" min={10} max={120} step={5} value={timerSeconds}
                        onChange={(e) => setTimerSeconds(parseInt(e.target.value, 10))}
                        className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                      />
                    </div>
                  )}
                </div>
                <div className="mb-1 text-xs font-black text-white">팀장 선택 <span className="ml-1 font-normal text-[#7b8a96]">{Object.keys(captainSelections).length}명 선택됨 · 아래 참가자 목록에서 팀장 버튼을 눌러 선택하세요</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={addRecruitment} disabled={saving} className="rounded border border-[#2a3540] bg-[#111c24] px-4 py-2 text-xs font-black text-white disabled:opacity-50">추가 모집</button>
                  <button type="button" onClick={() => { setDummyRows([auctionEmptyRow()]); setDummyOpen(true); }} className="val-btn border border-[#f6c945]/40 bg-[#f6c945]/10 px-3 py-2 text-xs font-black text-[#f6c945]" title="테스트용 더미 참가자 추가">🧪 더미 데이터</button>
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
                : <ParticipantList players={participants} guildMembers={guildMembers} onRemove={isAdmin ? removePlayer : undefined} settings={auctionSettings}
                    captainSelections={isAdmin ? captainSelections : undefined}
                    onToggleCaptain={isAdmin ? toggleCaptain : undefined}
                    onSetCaptainPoint={isAdmin ? setCaptainPoint : undefined}
                    defaultPoints={defaultPoints}
                  />
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

        {/* 더미 데이터 모달 */}
        {dummyOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4">
            <div className="val-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-white">🧪 더미 데이터 추가</h2>
                  <p className="mt-0.5 text-xs text-[#7b8a96]">테스트용 가상 참가자를 추가합니다. 디스코드 이름이 같으면 기존 유저로 처리됩니다.</p>
                </div>
                <button type="button" onClick={() => setDummyOpen(false)}
                  className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-xs font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white">
                  닫기
                </button>
              </div>
              <div className="space-y-3">
                {dummyRows.map((row, index) => (
                  <div key={index} className="rounded border border-[#2a3540] bg-[#0b141c] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-black text-[#7b8a96]">참가자 {index + 1}</span>
                      {dummyRows.length > 1 && (
                        <button type="button" onClick={() => setDummyRows((prev) => prev.filter((_, i) => i !== index))}
                          className="text-[11px] text-[#ff4655] hover:text-white">삭제</button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">디스코드 이름 <span className="text-[#ff4655]">*</span></label>
                        <input value={row.discordName} onChange={(e) => setDummyRow(index, { discordName: e.target.value })}
                          placeholder="예: 플레이어닉네임"
                          className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">라이엇 ID</label>
                        <input value={row.riotId} onChange={(e) => setDummyRow(index, { riotId: e.target.value })}
                          placeholder="예: 닉네임#KR1"
                          className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 font-mono text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">티어</label>
                        <select value={row.tierId} onChange={(e) => setDummyRow(index, { tierId: Number(e.target.value) })}
                          className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945]">
                          {AUCTION_TIER_OPTIONS.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">역할군</label>
                        <div className="flex flex-wrap gap-1.5">
                          {AUCTION_DUMMY_ROLES.map((role) => (
                            <button key={role} type="button"
                              onClick={() => setDummyRow(index, { valorantRole: row.valorantRole === role ? "" : role })}
                              className={`rounded px-2.5 py-1 text-xs font-black transition-colors ${row.valorantRole === role ? "bg-[#f6c945] text-[#0b141c]" : "border border-[#2a3540] bg-[#111c24] text-[#9aa8b3] hover:border-[#f6c945]/50"}`}>
                              {role}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">모스트 3 요원 <span className="font-normal text-[#56636f]">(쉼표로 구분, 예: 제트,오멘,레이나)</span></label>
                        <input value={row.favoriteAgents} onChange={(e) => setDummyRow(index, { favoriteAgents: e.target.value })}
                          placeholder="예: 제트,오멘,레이나"
                          className="w-full rounded border border-[#2a3540] bg-[#111c24] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#f6c945] placeholder:text-[#56636f]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setDummyRows((prev) => [...prev, auctionEmptyRow()])}
                disabled={dummyRows.length >= 20}
                className="mt-3 w-full rounded border border-dashed border-[#2a3540] py-2 text-xs font-black text-[#7b8a96] hover:border-[#f6c945]/50 hover:text-[#f6c945] disabled:opacity-40">
                + 참가자 추가
              </button>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setDummyOpen(false)}
                  className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-5 py-2 text-sm font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white">
                  취소
                </button>
                <button type="button" onClick={() => void submitDummy()} disabled={dummyAdding}
                  className="val-btn bg-[#f6c945] px-5 py-2 text-sm font-black text-[#0b141c] disabled:opacity-50">
                  {dummyAdding ? "추가 중..." : "추가"}
                </button>
              </div>
            </div>
          </div>
        )}
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
          {auction.auctionDuration > 0 && (
            <div className="mb-4 overflow-hidden rounded-full bg-[#1d2732]" style={{ height: 8 }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
            {/* 현재 매물 */}
            <section className="val-card p-6">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f6c945]">
                  {auction.phase === "reauction" ? "🔄 재경매" : "현재 경매 매물"}
                </div>
                {auction.auctionDuration > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7b8a96]">남은 시간</span>
                    <span className="text-2xl font-black" style={{ color: timerColor }}>{timeLeft}s</span>
                  </div>
                ) : isAdmin && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void manualResolve()} className="rounded bg-[#00e7c2] px-3 py-1.5 text-xs font-black text-black hover:bg-[#00c9ab]">낙찰 처리</button>
                    <button type="button" onClick={() => void manualPass()} className="rounded border border-[#ff4655]/40 bg-[#ff4655]/10 px-3 py-1.5 text-xs font-black text-[#ff8a95] hover:border-[#ff4655]">유찰</button>
                  </div>
                )}
              </div>
              <div className="mb-1 text-xs text-[#7b8a96]">
                대기 {queue.length}명 · 유찰 {failedQueue.length}명
              </div>

              {currentPlayer ? (() => {
                const showRiot = auctionSettings.showRiotNickname !== false;
                const showTier = auctionSettings.showRankTier !== false;
                const showRole = auctionSettings.showValorantRole !== false;
                const showAgents = auctionSettings.showFavoriteAgents !== false;
                const agents = parseAgents(currentPlayer.user.favoriteAgents).slice(0, 3);
                const roleLabels = toRoleLabels(currentPlayer.user.valorantRole);
                return (
                  <div className="mt-4 flex items-start gap-4">
                    {currentPlayer.user.image
                      ? <img src={currentPlayer.user.image} alt="" className="h-20 w-20 rounded-lg object-cover" />
                      : <div className="h-20 w-20 rounded-lg bg-[#24313c]" />
                    }
                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-black text-white">{resolveServerNick(currentPlayer.user.id, guildMembers, currentPlayer.user.name) ?? "이름 없음"}</div>
                      {showRiot && currentPlayer.user.riotAccounts.map((a) => (
                        <div key={a.gameName} className="mt-1 text-sm text-[#9aa8b3]">
                          {a.region.toUpperCase()} · {a.gameName}#{a.tagLine}
                          {showTier && a.cachedTierName && <span className="ml-2 rounded bg-[#ff4655]/12 px-2 py-0.5 text-xs font-bold text-[#ff8a95]">{a.cachedTierName}</span>}
                        </div>
                      ))}
                      {!showRiot && showTier && currentPlayer.user.riotAccounts.map((a) => a.cachedTierName && (
                        <span key={a.gameName} className="mt-1 mr-1 inline-block rounded bg-[#ff4655]/12 px-2 py-0.5 text-xs font-bold text-[#ff8a95]">{a.cachedTierName}</span>
                      ))}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {showRole && roleLabels.map((r) => (
                          <span key={r} className="rounded bg-[#24313c] px-2 py-0.5 text-[11px] font-bold text-[#c8d3db]">{r}</span>
                        ))}
                        {showAgents && agents.map((a) => {
                          const portrait = agentPortraits[normalizeAgentKey(a)];
                          return portrait ? (
                            <img key={a} src={portrait} alt={a} title={a} className="h-9 w-9 rounded bg-[#24313c] object-cover object-top ring-1 ring-white/10" />
                          ) : (
                            <span key={a} title={a} className="flex h-9 w-9 items-center justify-center rounded bg-[#24313c] text-[11px] font-black text-[#9aa8b3] ring-1 ring-white/10">{a.slice(0, 1)}</span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })() : (
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
                          <div className="text-sm font-black text-white">{captain ? resolveServerNick(captain.user.id, guildMembers, captain.user.name) : "팀장"}</div>
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
                        <span className="flex-1 truncate text-sm font-bold text-white">{resolveServerNick(p.user.id, guildMembers, p.user.name) ?? "이름 없음"}</span>
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
                <div className="mt-1 text-sm font-bold text-white truncate">{captain ? resolveServerNick(captain.user.id, guildMembers, captain.user.name) : "팀장"}</div>
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
                  <span className="text-xs font-bold text-[#9aa8b3]">{resolveServerNick(uid, guildMembers, p?.user.name) ?? uid}</span>
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

function ParticipantList({
  players,
  guildMembers,
  onRemove,
  settings,
  captainSelections,
  onToggleCaptain,
  onSetCaptainPoint,
  defaultPoints,
}: {
  players: ScrimPlayer[];
  guildMembers: GuildMemberOption[];
  onRemove?: (playerId: string) => void;
  settings?: ScrimDetailSettings;
  captainSelections?: Record<string, number>;
  onToggleCaptain?: (userId: string) => void;
  onSetCaptainPoint?: (userId: string, points: number) => void;
  defaultPoints?: number;
}) {
  const [agentPortraits, setAgentPortraits] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/valorant/agents", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { agents?: AgentOption[] } | null) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const agent of payload?.agents ?? []) {
          const image = agent.portrait || agent.icon;
          if (agent.name && image) next[normalizeAgentKey(agent.name)] = image;
        }
        setAgentPortraits(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const showRiot = settings?.showRiotNickname !== false;
  const showTier = settings?.showRankTier !== false;
  const showRole = settings?.showValorantRole !== false;
  const showAgents = settings?.showFavoriteAgents !== false;

  const captainMode = !!onToggleCaptain;
  const gridCols = [
    "minmax(150px,1.15fr)",
    showRiot ? "minmax(170px,1.05fr)" : null,
    showTier ? "86px" : null,
    "66px",
    showRole ? "86px" : null,
    showAgents ? "minmax(86px,0.65fr)" : null,
    captainMode ? "60px" : null,
    "28px",
  ].filter(Boolean).join(" ");

  if (players.length === 0) return <EmptyState text="참가자가 없습니다." />;

  return (
    <div className="overflow-hidden rounded border border-[#2a3540] bg-[#0b141c]/50">
      <div className="overflow-x-auto">
        <div style={{ minWidth: "400px" }}>
          <div className="items-center gap-1.5 border-b border-[#2a3540] bg-[#0f1923] px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#7b8a96]"
            style={{ display: "grid", gridTemplateColumns: gridCols }}>
            <div>Player</div>
            {showRiot && <div>Riot ID</div>}
            {showTier && <div>Tier</div>}
            <div className="text-right">KD</div>
            {showRole && <div>Role</div>}
            {showAgents && <div>Agents</div>}
            {captainMode && <div className="text-center">팀장</div>}
            <div />
          </div>
          <div className="divide-y divide-[#1f2d38]">
            {players.map((player) => (
              <ParticipantRow
                key={player.id}
                player={player}
                guildMembers={guildMembers}
                agentPortraits={agentPortraits}
                onRemove={onRemove ? () => onRemove(player.id) : undefined}
                settings={settings}
                gridCols={gridCols}
                captainSelections={captainSelections}
                onToggleCaptain={onToggleCaptain}
                onSetCaptainPoint={onSetCaptainPoint}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({
  player,
  guildMembers,
  agentPortraits,
  onRemove,
  settings,
  gridCols,
  captainSelections,
  onToggleCaptain,
  onSetCaptainPoint,
}: {
  player: ScrimPlayer;
  guildMembers: GuildMemberOption[];
  agentPortraits: Record<string, string>;
  onRemove?: () => void;
  settings?: ScrimDetailSettings;
  gridCols?: string;
  captainSelections?: Record<string, number>;
  onToggleCaptain?: (userId: string) => void;
  onSetCaptainPoint?: (userId: string, points: number) => void;
}) {
  const isSelected = captainSelections ? captainSelections[player.user.id] !== undefined : false;
  const displayName = resolveServerNick(player.user.id, guildMembers, player.user.name) || "이름 없음";
  const riotNames = player.user.riotAccounts.map((account) => `${account.region.toUpperCase()} · ${account.gameName}#${account.tagLine}`);
  const primaryTier = player.user.riotAccounts.find((account) => account.cachedTierName)?.cachedTierName ?? "Unranked";
  const roleLabels = toRoleLabels(player.user.valorantRole);
  const agents = parseAgents(player.user.favoriteAgents);
  const kd = player.kdSummary;

  const showRiot = settings?.showRiotNickname !== false;
  const showTier = settings?.showRankTier !== false;
  const showRole = settings?.showValorantRole !== false;
  const showAgents = settings?.showFavoriteAgents !== false;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", player.id);
      }}
      className={`cursor-grab items-center gap-1.5 px-2 py-1.5 transition active:cursor-grabbing ${isSelected ? "bg-[#f6c945]/8 hover:bg-[#f6c945]/12" : "hover:bg-[#13212b]"}`}
      style={{ display: "grid", gridTemplateColumns: gridCols ?? "minmax(150px,1.15fr) minmax(170px,1.05fr) 86px 66px 86px minmax(86px,0.65fr) 28px" }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {player.user.image ? (
          <img src={player.user.image} alt="" className="h-6 w-6 flex-shrink-0 rounded object-cover" />
        ) : (
          <div className="h-6 w-6 flex-shrink-0 rounded bg-[#24313c]" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-white">{displayName}</div>
          {isSelected ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                type="number" min={100} max={9999} step={50}
                value={captainSelections![player.user.id]}
                onChange={(e) => onSetCaptainPoint?.(player.user.id, parseInt(e.target.value, 10))}
                onClick={(e) => e.stopPropagation()}
                className="w-20 rounded border border-[#f6c945] bg-[#0b141c] px-1.5 py-0.5 text-xs font-bold text-white outline-none"
              />
              <span className="text-[10px] text-[#f6c945]">P</span>
            </div>
          ) : (
            <div className="text-[10px] font-bold text-[#52616d]">대기 참가자</div>
          )}
        </div>
      </div>
      {showRiot && (
        <div className="min-w-0 truncate text-xs font-bold text-[#9aa8b3]">
          {riotNames.join(" / ") || "Riot 계정 미연동"}
        </div>
      )}
      {showTier && (
        <div className="truncate">
          <span className="rounded bg-[#ff4655]/12 px-1.5 py-0.5 text-[10px] font-black text-[#ff8a95]">
            {primaryTier}
          </span>
        </div>
      )}
      <div className="text-right">
        {kd ? (
          <div>
            <div className={kd.kd >= 1 ? "text-sm font-black text-[#00e7c2]" : "text-sm font-black text-[#ff4655]"}>
              {kd.kd.toFixed(2)}
            </div>
            <div className="text-[9px] font-bold uppercase text-[#7b8a96]">{kd.source === "scrim" ? "내전" : "랭크"}</div>
          </div>
        ) : (
          <span className="text-xs font-bold text-[#52616d]">-</span>
        )}
      </div>
      {showRole && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {roleLabels.length > 0 ? (
            roleLabels.slice(0, 2).map((role) => (
              <span key={role} className="rounded bg-[#24313c] px-1.5 py-0.5 text-[10px] font-bold text-[#c8d3db]">
                {role}
              </span>
            ))
          ) : (
            <span className="text-xs font-bold text-[#52616d]">-</span>
          )}
        </div>
      )}
      {showAgents && (
        <div className="flex min-w-0 items-center gap-1">
          {agents.length > 0 ? (
            agents.slice(0, 3).map((agent) => {
              const portrait = agentPortraits[normalizeAgentKey(agent)];
              return portrait ? (
                <img
                  key={agent}
                  src={portrait}
                  alt={agent}
                  title={agent}
                  className="h-6 w-6 rounded bg-[#24313c] object-cover object-top ring-1 ring-white/10"
                />
              ) : (
                <span key={agent} title={agent} className="flex h-6 w-6 items-center justify-center rounded bg-[#24313c] text-[10px] font-black text-[#9aa8b3] ring-1 ring-white/10">
                  {agent.slice(0, 1)}
                </span>
              );
            })
          ) : (
            <span className="text-xs font-bold text-[#52616d]">-</span>
          )}
        </div>
      )}
      {onToggleCaptain && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCaptain(player.user.id); }}
          className={`flex h-6 w-14 items-center justify-center rounded text-[10px] font-black transition ${
            isSelected ? "bg-[#f6c945] text-black" : "bg-[#2a3540] text-[#9aa8b3] hover:bg-[#f6c945]/30 hover:text-white"
          }`}
        >
          {isSelected ? "✓ 팀장" : "팀장"}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-[#7b8a96] transition hover:bg-[#ff4655]/20 hover:text-[#ff4655]"
          title="참가자 제거"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}

function TeamCaptainRail({ teamIds, teamNames, players, onDrop, onRename, guildMembers = [], settings }: { teamIds: string[]; teamNames: Record<string, string>; players: ScrimPlayer[]; onDrop: (playerId: string, teamId: string) => void; onRename: (teamId: string, name: string) => void; guildMembers?: GuildMemberOption[]; settings?: ScrimDetailSettings }) {
  return (
    <div className="val-card p-4">
      <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Team Captains</div>
      <div className="space-y-3">
        {teamIds.map((tId, i) => {
          const captain = players.find((p) => p.team === tId && p.role === "captain");
          return (
            <div key={tId} className="rounded border border-[#2a3540] bg-[#0f1923]/80 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, tId); }}>
              <input defaultValue={teamNames[tId] ?? getDefaultTeamName(i)} onBlur={(e) => onRename(tId, e.target.value.trim())} className="mb-2 w-full rounded border border-[#384653] bg-[#111c24] px-2 py-1 text-xs font-black text-white outline-none focus:border-[#ff4655]" />
              {captain ? <PlayerCard player={captain} compact guildMembers={guildMembers} settings={settings} /> : <EmptyState text="팀장 슬롯" small />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamBoard({ teamId, name, color, captain, members, onDropCaptain, onDropMember, onRename, onRemove, guildMembers = [], settings }: { teamId: string; name: string; color: string; captain?: ScrimPlayer; members: ScrimPlayer[]; onDropCaptain?: (id: string) => void; onDropMember: (id: string) => void; onRename: (name: string) => void; onRemove?: (id: string) => void; guildMembers?: GuildMemberOption[]; settings?: ScrimDetailSettings }) {
  return (
    <article className="val-card overflow-hidden">
      <div className="border-b border-[#2a3540] bg-[#1d2732] px-5 py-4" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <input defaultValue={name} onBlur={(e) => onRename(e.target.value.trim())} className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none" />
          <span className="rounded border border-[#2a3540] px-2 py-1 text-[11px] font-black text-[#7b8a96]">{members.length + (captain ? 1 : 0)}명</span>
        </div>
      </div>
      <div className="grid gap-4 p-4">
        {onDropCaptain && (
          <DropAreaMini label="팀장" onDrop={onDropCaptain}>{captain ? <PlayerCard player={captain} guildMembers={guildMembers} settings={settings} onRemove={onRemove ? () => onRemove(captain.id) : undefined} /> : <EmptyState text="팀장 배치" />}</DropAreaMini>
        )}
        <DropAreaMini label="팀원" onDrop={onDropMember}>
          <div className="grid gap-2">
            {members.map((p) => <PlayerCard key={p.id} player={p} guildMembers={guildMembers} settings={settings} onRemove={onRemove ? () => onRemove(p.id) : undefined} />)}
            {members.length === 0 && <EmptyState text="팀원 배치" />}
          </div>
        </DropAreaMini>
      </div>
      <span className="sr-only">{teamId}</span>
    </article>
  );
}

function DropAreaMini({ label, children, onDrop }: { label: string; children: React.ReactNode; onDrop?: (id: string) => void }) {
  return (
    <div className="rounded border border-dashed border-[#33414e] bg-[#0b141c]/60 p-3" 
      onDragOver={(e) => onDrop ? e.preventDefault() : undefined} 
      onDrop={(e) => { 
        if (!onDrop) return;
        e.preventDefault(); 
        const id = e.dataTransfer.getData("text/plain"); 
        if (id) onDrop(id); 
      }}>
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#7b8a96]">{label}</div>
      {children}
    </div>
  );
}

function PlayerCard({ player, compact = false, onRemove, guildMembers = [], settings }: { player: ScrimPlayer; compact?: boolean; onRemove?: () => void; guildMembers?: GuildMemberOption[]; settings?: ScrimDetailSettings }) {
  const riotNames = player.user.riotAccounts.map((a) => `${a.region.toUpperCase()} · ${a.gameName}#${a.tagLine}`);
  const tiers = player.user.riotAccounts.map((a) => a.cachedTierName).filter(Boolean);
  const agents = parseAgents(player.user.favoriteAgents);
  const roleLabels = toRoleLabels(player.user.valorantRole);
  const kdSummary = player.kdSummary;

  const showDiscord = settings?.showDiscordNickname !== false;
  const showRiot = settings?.showRiotNickname !== false;
  const showTier = settings?.showRankTier !== false;
  const showRole = settings?.showValorantRole !== false;
  const showAgents = settings?.showFavoriteAgents !== false;

  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", player.id); }} className="cursor-grab flex flex-col h-full min-h-[120px] rounded border border-[#2a3540] bg-[#111c24] px-3 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition hover:border-[#7fffe6]/60 active:cursor-grabbing">
      <div className="flex items-center gap-3">
        {player.user.image ? <img src={player.user.image} alt="" className={compact ? "h-9 w-9 rounded-full object-cover" : "h-12 w-12 rounded object-cover"} /> : <div className={compact ? "h-9 w-9 rounded-full bg-[#24313c]" : "h-12 w-12 rounded bg-[#24313c]"} />}
        <div className="min-w-0 flex-1">
          {showDiscord && <div className="truncate text-sm font-black text-white">{resolveServerNick(player.user.id, guildMembers, player.user.name)}</div>}
          {showRiot && <div className="truncate text-[11px] text-[#7b8a96]">{riotNames.join(" · ") || "Riot 계정 미연동"}</div>}
          {!showDiscord && !showRiot && <div className="truncate text-sm font-black text-white">{resolveServerNick(player.user.id, guildMembers, player.user.name)}</div>}
        </div>
        {onRemove && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-1 flex-shrink-0 rounded p-1 text-[#7b8a96] hover:bg-[#ff4655]/20 hover:text-[#ff4655]" title="참가자 제거">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {kdSummary && (
          <span
            className={`rounded px-2 py-0.5 font-black ${kdSummary.source === "scrim" ? "bg-[#00e7c2]/12 text-[#00e7c2]" : "bg-[#7c5cff]/14 text-[#b8a7ff]"}`}
            title={`${kdSummary.kills}킬 ${kdSummary.deaths}데스 · ${kdSummary.matches}경기`}
          >
            {kdSummary.source === "scrim" ? "내전" : "랭크"} KD {kdSummary.kd.toFixed(2)}
          </span>
        )}
        {showTier && tiers.slice(0, 2).map((t) => <span key={t} className="rounded bg-[#ff4655]/12 px-2 py-0.5 font-bold text-[#ff8a95]">{t}</span>)}
        {showRole && roleLabels.map((r) => <span key={r} className="rounded bg-[#24313c] px-2 py-0.5 font-bold text-[#c8d3db]">{r}</span>)}
        {showAgents && agents.slice(0, 3).map((a) => <span key={a} className="rounded bg-[#0b141c] px-2 py-0.5 font-bold text-[#9aa8b3]">{a}</span>)}
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
  players, teamNames, onSave, guildMembers = [],
}: {
  players: ScrimPlayer[];
  teamNames: Record<string, string>;
  onSave: (kdaPlayers: { id: string; kills: number; deaths: number; assists: number }[]) => void;
  guildMembers?: GuildMemberOption[];
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
                            <span className="font-bold text-white truncate max-w-[120px]">{resolveServerNick(p.user.id, guildMembers, p.user.name) ?? "이름 없음"}</span>
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

// ─── 경기별 KDA 입력 패널 ────────────────────────────────────────────────────────
function GameKdaPanel({
  game, players, teamNames, gameKda, setGameKda, onSave, guildMembers = [],
}: {
  game: ScrimGame;
  players: ScrimPlayer[];
  teamNames: Record<string, string>;
  gameKda: Record<string, Record<string, number>>;
  setGameKda: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  onSave: (kda: { userId: string; kills: number; deaths: number; assists: number }[]) => void;
  guildMembers?: GuildMemberOption[];
}) {
  const [saved, setSaved] = useState(false);
  const kdaData = parseJson<Array<{ userId: string; kills: number; deaths: number; assists: number }>>(game.kdaSnapshot, []);

  // 초기값: DB에 저장된 값 또는 0
  const getValue = (userId: string, field: "kills" | "deaths" | "assists") => {
    if (gameKda[game.id]?.[`${userId}_${field}`] != null) return gameKda[game.id][`${userId}_${field}`];
    const row = kdaData.find((k) => k.userId === userId);
    return row ? row[field] : 0;
  };

  function update(userId: string, field: "kills" | "deaths" | "assists", val: string) {
    setGameKda((prev) => ({
      ...prev,
      [game.id]: { ...(prev[game.id] ?? {}), [`${userId}_${field}`]: parseInt(val, 10) || 0 },
    }));
    setSaved(false);
  }

  function handleSave() {
    const result = players.map((p) => ({
      userId: p.user.id,
      kills: getValue(p.user.id, "kills"),
      deaths: getValue(p.user.id, "deaths"),
      assists: getValue(p.user.id, "assists"),
    }));
    onSave(result);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const teams = Array.from(new Set(players.map((p) => p.team))).sort();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">KDA 입력</div>
        <button type="button" onClick={handleSave}
          className={`rounded px-3 py-1 text-xs font-black transition-colors ${saved ? "bg-[#00e7c2] text-black" : "bg-[#ff4655] text-white"}`}>
          {saved ? "저장됨 ✓" : "저장"}
        </button>
      </div>
      <div className="space-y-3">
        {teams.map((tId, ti) => {
          const teamPlayers = players.filter((p) => p.team === tId);
          const color = TEAM_COLORS[ti % TEAM_COLORS.length];
          return (
            <div key={tId}>
              <div className="mb-1 text-[10px] font-black uppercase" style={{ color }}>{teamNames[tId] ?? getDefaultTeamName(ti)}</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a3540]">
                    <th className="pb-1 text-left font-black text-[#7b8a96]">플레이어</th>
                    <th className="pb-1 w-16 text-center font-black text-[#7b8a96]">K</th>
                    <th className="pb-1 w-16 text-center font-black text-[#7b8a96]">D</th>
                    <th className="pb-1 w-16 text-center font-black text-[#7b8a96]">A</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1d2732]">
                  {teamPlayers.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1 pr-2 text-white truncate max-w-[100px]">{resolveServerNick(p.user.id, guildMembers, p.user.name) ?? "이름 없음"}</td>
                      {(["kills", "deaths", "assists"] as const).map((field) => (
                        <td key={field} className="py-1 px-1">
                          <input
                            type="number" min={0} max={99}
                            value={getValue(p.user.id, field)}
                            onChange={(e) => update(p.user.id, field, e.target.value)}
                            className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-1 py-1 text-center font-black text-white outline-none focus:border-[#ff4655]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}


