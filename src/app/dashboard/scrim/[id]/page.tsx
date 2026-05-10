"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

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
  players: ScrimPlayer[];
}

interface GuildMemberOption {
  userId: string;
  discordId: string | null;
  name: string | null;
  image: string | null;
}

const DROP_ZONES = [
  { key: "participant", role: "participant", label: "참가자 목록" },
  { key: "team_a:captain", team: "team_a", role: "captain", label: "Team A 팀장" },
  { key: "team_a:member", team: "team_a", role: "member", label: "Team A 팀원" },
  { key: "team_b:captain", team: "team_b", role: "captain", label: "Team B 팀장" },
  { key: "team_b:member", team: "team_b", role: "member", label: "Team B 팀원" },
];

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

export default function ScrimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scrim, setScrim] = useState<ScrimDetail | null>(null);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [guildMembers, setGuildMembers] = useState<GuildMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newManagerId, setNewManagerId] = useState("");

  useEffect(() => {
    fetch(`/api/scrim/${id}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setScrim(data.scrim ?? null);
        setManagerIds(data.managerIds ?? []);
        setGuildMembers(data.guildMembers ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const grouped = useMemo(() => {
    const base = new Map<string, ScrimPlayer[]>();
    for (const zone of DROP_ZONES) base.set(zone.key, []);
    for (const player of scrim?.players ?? []) {
      const key = player.team === "team_a" || player.team === "team_b" ? `${player.team}:${player.role}` : "participant";
      base.get(base.has(key) ? key : "participant")?.push(player);
    }
    return base;
  }, [scrim?.players]);

  async function savePlayers(players: ScrimPlayer[], nextManagers = managerIds) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/scrim/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: players.map((player) => ({ id: player.id, team: player.team, role: player.role })),
          managerIds: nextManagers,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setScrim(data.scrim);
      setManagerIds(nextManagers);
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleDrop(playerId: string, team: string | undefined, role: string) {
    if (!scrim) return;
    const nextPlayers = scrim.players.map((player) =>
      player.id === playerId ? { ...player, team: team ?? "participant", role } : player
    );
    savePlayers(nextPlayers);
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
    savePlayers(scrim?.players ?? [], [...managerIds, newManagerId]);
    setNewManagerId("");
  }

  if (loading) return <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>;
  if (!scrim) return <div className="val-card p-12 text-center text-[#7b8a96]">내전을 찾을 수 없습니다.</div>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/scrim" className="text-xs font-bold text-[#7b8a96] hover:text-white">
            ← 내전 목록
          </Link>
          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">SCRIM DETAIL</div>
          <h1 className="mt-1 text-3xl font-black text-white">{scrim.title}</h1>
          <p className="mt-1 text-sm font-bold text-[#9aa8b3]">{formatDateTime(scrim.scheduledAt)}</p>
        </div>
        <button
          type="button"
          onClick={addRecruitment}
          disabled={saving}
          className="val-btn bg-[#ff4655] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          추가 모집
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          {scrim.description && (
            <div className="val-card p-5">
              <h2 className="mb-2 text-sm font-black text-white">설명</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">{scrim.description}</p>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {DROP_ZONES.map((zone) => (
              <DropZone
                key={zone.key}
                label={zone.label}
                players={grouped.get(zone.key) ?? []}
                onDrop={(playerId) => handleDrop(playerId, zone.team, zone.role)}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
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

          <div className="val-card p-5 text-xs leading-relaxed text-[#9aa8b3]">
            <div className="mb-2 font-black text-white">사용 방법</div>
            <p>디스코드 모집 글에 ✅ 이모지를 누른 멤버가 참가자 목록에 자동 등록됩니다.</p>
            <p className="mt-2">참가자 카드를 드래그해서 팀장 또는 팀원 칸에 놓으면 바로 저장됩니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DropZone({
  label,
  players,
  onDrop,
}: {
  label: string;
  players: ScrimPlayer[];
  onDrop: (playerId: string) => void;
}) {
  return (
    <div
      className="val-card min-h-48 p-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const playerId = event.dataTransfer.getData("text/plain");
        if (playerId) onDrop(playerId);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-white">{label}</h2>
        <span className="text-xs text-[#7b8a96]">{players.length}명</span>
      </div>
      <div className="flex flex-col gap-2">
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
        {players.length === 0 && (
          <div className="rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 px-3 py-8 text-center text-xs text-[#7b8a96]">
            여기에 드래그해서 배치
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ player }: { player: ScrimPlayer }) {
  const riotNames = player.user.riotAccounts.map((account) => `${account.region} ${account.gameName}#${account.tagLine}`);
  const tiers = player.user.riotAccounts.map((account) => account.cachedTierName).filter(Boolean);
  const agents = parseAgents(player.user.favoriteAgents);

  return (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", player.id)}
      className="cursor-grab rounded border border-[#2a3540] bg-[#0f1923]/80 px-3 py-3 active:cursor-grabbing"
    >
      <div className="flex items-center gap-3">
        {player.user.image ? <img src={player.user.image} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-[#24313c]" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-white">{player.user.name ?? "이름 없음"}</div>
          <div className="truncate text-[11px] text-[#7b8a96]">{riotNames.join(" · ") || "Riot 계정 미연동"}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {tiers.slice(0, 2).map((tier) => (
          <span key={tier} className="rounded bg-[#ff4655]/10 px-2 py-0.5 font-bold text-[#ff8a95]">{tier}</span>
        ))}
        {player.user.valorantRole && <span className="rounded bg-[#24313c] px-2 py-0.5 font-bold text-[#c8d3db]">{player.user.valorantRole}</span>}
        {agents.slice(0, 3).map((agent) => (
          <span key={agent} className="rounded bg-[#111c24] px-2 py-0.5 font-bold text-[#9aa8b3]">{agent}</span>
        ))}
      </div>
    </div>
  );
}
