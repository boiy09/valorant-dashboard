"use client";

import { useEffect, useState } from "react";

export interface ProfileAccount {
  region: string;
  riotId: string;
  level?: number | null;
  card?: string | null;
  tier?: string | null;
  rankIcon?: string | null;
  isVerified?: boolean;
}

export interface ProfileData {
  name: string | null;
  image: string | null;
  email?: string | null;
  profileBio?: string | null;
  discordId?: string | null;
  roles?: string[];
  riotId?: string | null;
  riotAccounts?: ProfileAccount[];
  isOnline?: boolean;
  valorantRole?: string | null;
  favoriteAgents?: string[];
}

interface ProfileModalProps {
  title?: string;
  profile: ProfileData | null;
  editable?: boolean;
  onClose: () => void;
  onProfileSaved?: (data: Pick<ProfileData, "profileBio" | "valorantRole" | "favoriteAgents">) => void;
}

interface AgentOption {
  id: string;
  name: string;
  icon: string | null;
  portrait?: string | null;
  role: string;
  roleLabel: string;
  roleIcon: string | null;
}

interface RoleOption {
  role: string;
  label: string;
  icon: string | null;
  count: number;
}

const PROFILE_SAVED_MESSAGE = "프로필이 저장되었습니다.";

function parseProfileRoles(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

function getInitial(name?: string | null) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function regionLabel(region: string) {
  return region.toUpperCase() === "AP" ? "AP · 아섭" : "KR · 한섭";
}

export default function ProfileModal({
  title = "프로필",
  profile,
  editable = false,
  onClose,
  onProfileSaved,
}: ProfileModalProps) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [profileBio, setProfileBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setSelectedRoles(parseProfileRoles(profile.valorantRole));
    setSelectedAgents(profile.favoriteAgents ?? []);
    setProfileBio(profile.profileBio ?? "");
    setMessage(null);
  }, [profile?.discordId, profile?.profileBio, profile?.name, profile?.valorantRole, profile?.favoriteAgents]);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    fetch("/api/valorant/agents", { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : { roles: [], agents: [] }))
      .then((data) => {
        if (cancelled) return;
        setRoles(data.roles ?? []);
        setAgents(data.agents ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [Boolean(profile)]);

  if (!profile) return null;

  const displayName = profile.name || "이름 없음";
  const accounts = profile.riotAccounts ?? [];
  const activeRoleValues = editable ? selectedRoles : parseProfileRoles(profile.valorantRole);
  const currentRoles = roles.filter((role) => activeRoleValues.includes(role.role));
  const favoriteAgentDetails = (editable ? selectedAgents : profile.favoriteAgents ?? []).map(
    (name) =>
      agents.find((agent) => agent.name === name) ?? {
        id: name,
        name,
        icon: null,
        role: "",
        roleLabel: "",
        roleIcon: null,
      }
  );
  const canSave = editable && !saving;
  const saved = message === PROFILE_SAVED_MESSAGE;

  function toggleRole(role: string) {
    if (!editable) return;
    setSelectedRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    );
  }

  function toggleAgent(name: string) {
    if (!editable) return;
    setSelectedAgents((current) => {
      if (current.includes(name)) return current.filter((agent) => agent !== name);
      if (current.length >= 3) {
        setMessage("모스트 요원은 최대 3개까지 선택할 수 있습니다.");
        return current;
      }
      setMessage(null);
      return [...current, name];
    });
  }

  async function saveProfile() {
    if (!editable) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileBio,
          valorantRole: selectedRoles,
          favoriteAgents: selectedAgents,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "프로필 저장 실패");
      onProfileSaved?.({
        profileBio: data.profileBio ?? "",
        valorantRole: data.valorantRole,
        favoriteAgents: data.favoriteAgents ?? [],
      });
      setProfileBio(data.profileBio ?? "");
      setMessage(PROFILE_SAVED_MESSAGE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로필 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="val-card max-h-[88vh] w-full max-w-2xl overflow-hidden p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-[#2a3540] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {profile.image ? (
              <img
                src={profile.image}
                alt={displayName}
                className="h-14 w-14 rounded-full border border-[#ff4655]/45 object-cover shadow-[0_0_22px_rgba(255,70,85,0.22)]"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#2a3540] bg-[#1a242d] text-xl font-black text-[#7b8a96]">
                {getInitial(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff4655]">{title}</p>
              <h2 className="truncate text-xl font-black text-white">{displayName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#7b8a96]">
                {typeof profile.isOnline === "boolean" && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${profile.isOnline ? "bg-green-400" : "bg-[#4a5a68]"}`} />
                    {profile.isOnline ? "온라인" : "오프라인"}
                  </span>
                )}
                {profile.discordId && <span>Discord ID {profile.discordId}</span>}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="val-mini-button flex-shrink-0 px-3 py-1 text-xs" aria-label="프로필 닫기">
            닫기
          </button>
        </div>

        <div className="member-scroll mt-4 max-h-[calc(88vh-7.5rem)] space-y-4 overflow-y-auto pr-1">
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">한줄 소개</p>
              {editable && <span className="text-[10px] text-[#7b8a96]">{profileBio.length} / 80</span>}
            </div>
            {editable ? (
              <input
                value={profileBio}
                onChange={(event) => setProfileBio(event.target.value.slice(0, 80))}
                placeholder="예: 오늘도 한 판만 하고 자는 사람"
                className="w-full rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-sm font-bold text-[#ece8e1] outline-none transition-colors placeholder:text-[#4a5a68] focus:border-[#ff4655]/70"
              />
            ) : (
              <div className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-sm font-bold text-[#ece8e1]">
                {profile.profileBio?.trim() || "등록된 소개가 없습니다."}
              </div>
            )}
          </div>

          {profile.roles && profile.roles.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">역할</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.roles.map((role) => (
                  <span key={role} className="rounded border border-[#ff4655]/25 bg-[#ff4655]/10 px-2 py-1 text-[10px] font-bold text-[#ff8a95]">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">라이엇 계정</p>
            {accounts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((account) => (
                  <div key={`${account.region}-${account.riotId}`} className="rounded border border-[#2a3540] bg-[#0f1923]/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-[#ff4655]">{regionLabel(account.region)}</span>
                      {typeof account.isVerified === "boolean" && (
                        <span className="text-[10px] text-[#7b8a96]">{account.isVerified ? "인증됨" : "미인증"}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {account.card ? (
                        <img src={account.card} alt="" className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded bg-[#1a242d]" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">{account.riotId}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#9aa8b3]">
                          {account.rankIcon && <img src={account.rankIcon} alt="" className="h-4 w-4 object-contain" />}
                          <span className="truncate">{account.tier || "티어 정보 없음"}</span>
                          {account.level !== null && account.level !== undefined && <span>Lv. {account.level}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="연동된 라이엇 계정이 없습니다." />
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">발로란트 역할군</p>
              {currentRoles.length > 0 && (
                <span className="text-[10px] font-bold text-[#ff4655]">{currentRoles.map((role) => role.label).join(" / ")}</span>
              )}
            </div>
            {editable ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {roles.map((role) => (
                  <button
                    key={role.role}
                    type="button"
                    onClick={() => toggleRole(role.role)}
                    className={`rounded border p-2 text-left transition-colors ${
                      selectedRoles.includes(role.role)
                        ? "border-[#ff4655] bg-[#ff4655]/15 text-white"
                        : "border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/55"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {role.icon && <img src={role.icon} alt="" className="h-5 w-5 object-contain" />}
                      <span className="text-xs font-black">{role.label}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#7b8a96]">{role.count}명 요원</div>
                  </button>
                ))}
              </div>
            ) : currentRoles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {currentRoles.map((role) => (
                  <span key={role.role} className="inline-flex items-center gap-2 rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-sm font-black text-white">
                    {role.icon && <img src={role.icon} alt="" className="h-5 w-5 object-contain" />}
                    {role.label}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState text="선택한 역할군이 없습니다." />
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">모스트 요원</p>
              {editable && <span className="text-[10px] text-[#7b8a96]">{selectedAgents.length} / 3</span>}
            </div>
            {editable ? (
              <div className="member-scroll grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {agents.map((agent) => {
                  const selected = selectedAgents.includes(agent.name);

                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.name)}
                      className={`flex items-center gap-2 rounded border p-2 text-left transition-colors ${
                        selected ? "border-[#0fffd0] bg-[#0fffd0]/10" : "border-[#2a3540] bg-[#0f1923]/70 hover:border-[#ff4655]/55"
                      }`}
                    >
                      {agent.portrait || agent.icon ? (
                        <img src={agent.portrait ?? agent.icon ?? ""} alt="" className="h-10 w-10 rounded object-contain object-bottom" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-[#1a242d]" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-white">{agent.name}</div>
                        <div className="truncate text-[10px] text-[#7b8a96]">{agent.roleLabel}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : favoriteAgentDetails.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {favoriteAgentDetails.map((agent) => (
                  <div key={agent.name} className="rounded border border-[#2a3540] bg-[#0f1923]/70 p-2">
                    {agent.portrait || agent.icon ? (
                      <img src={agent.portrait ?? agent.icon ?? ""} alt="" className="h-24 w-full rounded object-contain object-bottom" />
                    ) : (
                      <div className="h-24 rounded bg-[#1a242d]" />
                    )}
                    <div className="mt-1 truncate text-xs font-black text-white">{agent.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="선택한 모스트 요원이 없습니다." />
            )}
          </div>

          {message && (
            <div
              className={`rounded border px-3 py-2 text-xs font-bold ${
                saved ? "border-[#0fffd0]/35 bg-[#0fffd0]/10 text-[#0fffd0]" : "border-[#2a3540] bg-[#0f1923]/70 text-[#c8d3db]"
              }`}
            >
              {message}
            </div>
          )}

          {editable && (
            <div className="flex justify-end">
              <button type="button" onClick={saveProfile} disabled={!canSave} className="val-btn bg-[#ff4655] px-5 py-2 text-xs font-black text-white disabled:opacity-50">
                {saving ? "저장 중" : "프로필 저장"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 px-3 py-4 text-center text-xs text-[#7b8a96]">
      {text}
    </div>
  );
}
