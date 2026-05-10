"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

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

const ROLE_LABELS: Record<string, string> = {
  Duelist: "타격대",
  Initiator: "척후대",
  Controller: "전략가",
  Sentinel: "감시자",
  duelist: "타격대",
  initiator: "척후대",
  controller: "전략가",
  sentinel: "감시자",
};

const TEAM_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const TEAM_COLORS = ["#00e7c2", "#ff4655", "#f6c945", "#9b7cff", "#4da3ff", "#ff8d4d", "#66e08a", "#d45bff"];

function getTeamId(index: number) {
  return `team_${TEAM_LETTERS[index].toLowerCase()}`;
}

function getDefaultTeamName(index: number) {
  return `TEAM ${TEAM_LETTERS[index]}`;
}

function parseAgents(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "시작 시간 미정";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function parseSettings(value: string | null | undefined): ScrimDetailSettings {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as ScrimDetailSettings) : {};
  } catch {
    return {};
  }
}

function toRoleLabels(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean)
    .map((role) => ROLE_LABELS[role] ?? role);
}

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
    const fromSettings = Object.keys(settings.teamNames ?? {}).filter((teamId) => teamId.startsWith("team_"));
    const fromPlayers = (scrim?.players ?? [])
      .map((player) => player.team)
      .filter((team) => team.startsWith("team_"));
    const merged = Array.from(new Set([...fromSettings, ...fromPlayers, "team_a", "team_b"]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [scrim?.players, settings.teamNames]);

  const teamNames = useMemo(() => {
    const names = { ...(settings.teamNames ?? {}) };
    teamIds.forEach((teamId, index) => {
      if (!names[teamId]) names[teamId] = getDefaultTeamName(index);
    });
    return names;
  }, [settings.teamNames, teamIds]);

  const isTeamCaptain = useCallback((player: ScrimPlayer) => player.team.startsWith("team_") && player.role === "captain", []);
  const isTeamMember = useCallback((player: ScrimPlayer) => player.team.startsWith("team_") && player.role === "member", []);

  const participantPlayers = useMemo(
    () => (scrim?.players ?? []).filter((player) => !player.team.startsWith("team_") || player.role === "participant"),
    [scrim?.players]
  );

  const assignedPlayers = useMemo(
    () => (scrim?.players ?? []).filter((player) => isTeamCaptain(player) || isTeamMember(player)),
    [isTeamCaptain, isTeamMember, scrim?.players]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadScrim({ silent = false } = {}) {
      if (!silent) setLoading(true);
      try {
        const response = await fetch(`/api/scrim/${id}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        setScrim(data.scrim ?? null);
        setManagerIds(data.managerIds ?? []);
        setGuildMembers(data.guildMembers ?? []);
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    loadScrim();
    const timer = window.setInterval(() => loadScrim({ silent: true }), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id]);

  async function patchScrim(payload: { players?: ScrimPlayer[]; managerIds?: string[]; settings?: ScrimDetailSettings }) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/scrim/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: payload.players?.map((player) => ({ id: player.id, team: player.team, role: player.role })),
          managerIds: payload.managerIds,
          settings: payload.settings,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setScrim(data.scrim);
      if (payload.managerIds) setManagerIds(payload.managerIds);
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function movePlayer(playerId: string, team: string, role: string) {
    if (!scrim) return;
    const nextPlayers = scrim.players.map((player) => (player.id === playerId ? { ...player, team, role } : player));
    setScrim({ ...scrim, players: nextPlayers });
    void patchScrim({ players: nextPlayers });
  }

  async function addRecruitment() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/scrim", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "추가 모집 글 작성에 실패했습니다.");
      setMessage("추가 모집 글을 작성했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추가 모집 글 작성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function addManager() {
    if (!newManagerId || managerIds.includes(newManagerId) || managerIds.length >= 5) return;
    const nextManagers = [...managerIds, newManagerId];
    setManagerIds(nextManagers);
    void patchScrim({ managerIds: nextManagers });
    setNewManagerId("");
  }

  function updateTeamName(teamId: string, name: string) {
    if (!scrim) return;
    const nextSettings = {
      ...settings,
      teamNames: {
        ...teamNames,
        [teamId]: name || teamNames[teamId],
      },
    };
    setScrim({ ...scrim, settings: JSON.stringify(nextSettings) });
    void patchScrim({ settings: nextSettings });
  }

  function addTeam() {
    if (!scrim || teamIds.length >= TEAM_LETTERS.length) return;
    const nextTeamId = getTeamId(teamIds.length);
    const nextSettings = {
      ...settings,
      teamNames: {
        ...teamNames,
        [nextTeamId]: getDefaultTeamName(teamIds.length),
      },
    };
    setScrim({ ...scrim, settings: JSON.stringify(nextSettings) });
    void patchScrim({ settings: nextSettings });
  }

  if (loading) return <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>;
  if (!scrim) return <div className="val-card p-12 text-center text-[#7b8a96]">내전을 찾을 수 없습니다.</div>;

  const captainCount = assignedPlayers.filter((player) => player.role === "captain").length;
  const memberCount = assignedPlayers.filter((player) => player.role === "member").length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">
            ← 내전 목록
          </Link>
          <div className="mt-4 text-[10px] uppercase tracking-[0.32em] text-[#ff4655]">SCRIM WAITING ROOM</div>
          <h1 className="mt-2 text-4xl font-black text-white">{scrim.title}</h1>
          <p className="mt-2 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addTeam}
            disabled={saving}
            className="val-btn border border-[#2a3540] bg-[#111c24] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            팀 추가
          </button>
          <button
            type="button"
            onClick={addRecruitment}
            disabled={saving}
            className="val-btn bg-[#ff4655] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            추가 모집
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <StatCard label="참가자" value={`${scrim.players.length}`} suffix="명" />
        <StatCard label="팀장" value={`${captainCount}`} suffix="명" />
        <StatCard label="팀원" value={`${memberCount}`} suffix="명" />
      </section>

      {scrim.description && (
        <section className="val-card mb-5 p-5">
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Description</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">{scrim.description}</p>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <TeamCaptainRail
            teamIds={teamIds}
            teamNames={teamNames}
            players={scrim.players}
            onDrop={(playerId, teamId) => movePlayer(playerId, teamId, "captain")}
            onRename={updateTeamName}
          />
        </aside>

        <main className="space-y-5">
          <DropArea
            title={`참가자 목록 (${participantPlayers.length}명)`}
            subtitle="드래그해서 팀장 또는 팀원 슬롯으로 바로 배치하세요."
            onDrop={(playerId) => movePlayer(playerId, "participant", "participant")}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {participantPlayers.map((player) => (
                <PlayerCard key={player.id} player={player} compact />
              ))}
              {participantPlayers.length === 0 && <EmptyState text="대기 중인 참가자가 없습니다." />}
            </div>
          </DropArea>

          <section className="grid gap-4 lg:grid-cols-2">
            {teamIds.map((teamId, index) => {
              const captain = scrim.players.find((player) => player.team === teamId && player.role === "captain");
              const members = scrim.players.filter((player) => player.team === teamId && player.role === "member");
              return (
                <TeamBoard
                  key={teamId}
                  teamId={teamId}
                  name={teamNames[teamId] ?? getDefaultTeamName(index)}
                  color={TEAM_COLORS[index % TEAM_COLORS.length]}
                  captain={captain}
                  members={members}
                  onDropCaptain={(playerId) => movePlayer(playerId, teamId, "captain")}
                  onDropMember={(playerId) => movePlayer(playerId, teamId, "member")}
                  onRename={(name) => updateTeamName(teamId, name)}
                />
              );
            })}
          </section>
        </main>

        <aside className="space-y-4">
          <ManagerPanel
            managerIds={managerIds}
            guildMembers={guildMembers}
            newManagerId={newManagerId}
            setNewManagerId={setNewManagerId}
            addManager={addManager}
          />
          <div className="val-card p-5 text-xs leading-relaxed text-[#9aa8b3]">
            <div className="mb-2 font-black text-white">사용 방법</div>
            <p>디스코드 모집 글에 아무 이모지를 누른 멤버가 참가자 목록에 자동 등록됩니다.</p>
            <p className="mt-2">참가자 카드를 드래그해서 팀장 또는 팀원 영역에 놓으면 즉시 화면에 반영되고 저장됩니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

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

function DropArea({
  title,
  subtitle,
  children,
  onDrop,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onDrop: (playerId: string) => void;
}) {
  return (
    <section
      className="val-card p-5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const playerId = event.dataTransfer.getData("text/plain");
        if (playerId) onDrop(playerId);
      }}
    >
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

function TeamCaptainRail({
  teamIds,
  teamNames,
  players,
  onDrop,
  onRename,
}: {
  teamIds: string[];
  teamNames: Record<string, string>;
  players: ScrimPlayer[];
  onDrop: (playerId: string, teamId: string) => void;
  onRename: (teamId: string, name: string) => void;
}) {
  return (
    <div className="val-card p-4">
      <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">Team Captains</div>
      <div className="space-y-3">
        {teamIds.map((teamId, index) => {
          const captain = players.find((player) => player.team === teamId && player.role === "captain");
          return (
            <div
              key={teamId}
              className="rounded border border-[#2a3540] bg-[#0f1923]/80 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const playerId = event.dataTransfer.getData("text/plain");
                if (playerId) onDrop(playerId, teamId);
              }}
            >
              <input
                defaultValue={teamNames[teamId] ?? getDefaultTeamName(index)}
                onBlur={(event) => onRename(teamId, event.target.value.trim())}
                className="mb-2 w-full rounded border border-[#384653] bg-[#111c24] px-2 py-1 text-xs font-black text-white outline-none focus:border-[#ff4655]"
              />
              {captain ? <PlayerCard player={captain} compact /> : <EmptyState text="팀장 슬롯" small />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamBoard({
  teamId,
  name,
  color,
  captain,
  members,
  onDropCaptain,
  onDropMember,
  onRename,
}: {
  teamId: string;
  name: string;
  color: string;
  captain?: ScrimPlayer;
  members: ScrimPlayer[];
  onDropCaptain: (playerId: string) => void;
  onDropMember: (playerId: string) => void;
  onRename: (name: string) => void;
}) {
  return (
    <article className="val-card overflow-hidden">
      <div className="border-b border-[#2a3540] bg-[#1d2732] px-5 py-4" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <input
            defaultValue={name}
            onBlur={(event) => onRename(event.target.value.trim())}
            className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none"
          />
          <span className="rounded border border-[#2a3540] px-2 py-1 text-[11px] font-black text-[#7b8a96]">
            {members.length + (captain ? 1 : 0)}명
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-4">
        <DropAreaMini label="팀장" onDrop={onDropCaptain}>
          {captain ? <PlayerCard player={captain} /> : <EmptyState text="팀장 배치" />}
        </DropAreaMini>
        <DropAreaMini label="팀원" onDrop={onDropMember}>
          <div className="grid gap-2">
            {members.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {members.length === 0 && <EmptyState text="팀원 배치" />}
          </div>
        </DropAreaMini>
      </div>
      <span className="sr-only">{teamId}</span>
    </article>
  );
}

function DropAreaMini({ label, children, onDrop }: { label: string; children: React.ReactNode; onDrop: (playerId: string) => void }) {
  return (
    <div
      className="rounded border border-dashed border-[#33414e] bg-[#0b141c]/60 p-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const playerId = event.dataTransfer.getData("text/plain");
        if (playerId) onDrop(playerId);
      }}
    >
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#7b8a96]">{label}</div>
      {children}
    </div>
  );
}

function PlayerCard({ player, compact = false }: { player: ScrimPlayer; compact?: boolean }) {
  const riotNames = player.user.riotAccounts.map((account) => `${account.region.toUpperCase()} · ${account.gameName}#${account.tagLine}`);
  const tiers = player.user.riotAccounts.map((account) => account.cachedTierName).filter(Boolean);
  const agents = parseAgents(player.user.favoriteAgents);
  const roleLabels = toRoleLabels(player.user.valorantRole);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", player.id);
      }}
      className="cursor-grab rounded border border-[#2a3540] bg-[#111c24] px-3 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition hover:border-[#7fffe6]/60 active:cursor-grabbing"
    >
      <div className="flex items-center gap-3">
        {player.user.image ? (
          <img src={player.user.image} alt="" className={compact ? "h-9 w-9 rounded-full object-cover" : "h-12 w-12 rounded object-cover"} />
        ) : (
          <div className={compact ? "h-9 w-9 rounded-full bg-[#24313c]" : "h-12 w-12 rounded bg-[#24313c]"} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-white">{player.user.name ?? "이름 없음"}</div>
          <div className="truncate text-[11px] text-[#7b8a96]">{riotNames.join(" · ") || "Riot 계정 미연동"}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {tiers.slice(0, 2).map((tier) => (
          <span key={tier} className="rounded bg-[#ff4655]/12 px-2 py-0.5 font-bold text-[#ff8a95]">
            {tier}
          </span>
        ))}
        {roleLabels.map((role) => (
          <span key={role} className="rounded bg-[#24313c] px-2 py-0.5 font-bold text-[#c8d3db]">
            {role}
          </span>
        ))}
        {agents.slice(0, 3).map((agent) => (
          <span key={agent} className="rounded bg-[#0b141c] px-2 py-0.5 font-bold text-[#9aa8b3]">
            {agent}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <div className={`rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 text-center text-xs text-[#7b8a96] ${small ? "px-2 py-3" : "px-3 py-8"}`}>
      {text}
    </div>
  );
}

function ManagerPanel({
  managerIds,
  guildMembers,
  newManagerId,
  setNewManagerId,
  addManager,
}: {
  managerIds: string[];
  guildMembers: GuildMemberOption[];
  newManagerId: string;
  setNewManagerId: (value: string) => void;
  addManager: () => void;
}) {
  return (
    <div className="val-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-white">내전 관리자</h2>
        <span className="text-xs text-[#7b8a96]">{managerIds.length}/5</span>
      </div>
      <div className="mb-3 flex flex-col gap-2">
        {managerIds.map((managerId) => {
          const member = guildMembers.find((item) => item.discordId === managerId || item.userId === managerId);
          return (
            <div key={managerId} className="flex items-center gap-2 rounded border border-[#2a3540] bg-[#0f1923]/70 px-2 py-2">
              {member?.image ? <img src={member.image} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-[#24313c]" />}
              <span className="min-w-0 flex-1 truncate text-xs font-black text-white">{member?.name ?? managerId}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <select
          value={newManagerId}
          onChange={(event) => setNewManagerId(event.target.value)}
          className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 text-xs font-bold text-white outline-none"
        >
          <option value="">관리자 선택</option>
          {guildMembers.map((member) => (
            <option key={member.userId} value={member.discordId ?? member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={addManager} disabled={managerIds.length >= 5} className="rounded bg-[#ff4655] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
          추가
        </button>
      </div>
    </div>
  );
}
