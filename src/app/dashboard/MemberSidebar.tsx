"use client";

import { useEffect, useState } from "react";

interface Member {
  id: string;
  discordId: string;
  name: string;
  image: string | null;
  roles: string[];
  riotId: string | null;
  isOnline: boolean;
}

type RoleGroup = "admin" | "valonekki" | "member";
type SectionKey = "admin" | "valonekki" | "online" | "offline";

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const VALONEKKI_ROLE_KEYWORDS = ["발로네끼", "발로세끼", "valonekki", "valosegi"];

const SECTION_STYLES: Record<
  SectionKey,
  { label: string; emoji: string; dot: string; text: string; ring: string }
> = {
  admin: {
    label: "관리자",
    emoji: "⭐",
    dot: "bg-[#ff4655]",
    text: "text-[#ff4655]",
    ring: "ring-1 ring-[#ff4655]/60",
  },
  valonekki: {
    label: "발로네끼",
    emoji: "⚜️",
    dot: "bg-orange-400",
    text: "text-orange-400",
    ring: "ring-1 ring-orange-400/60",
  },
  online: {
    label: "온라인",
    emoji: "●",
    dot: "bg-green-400",
    text: "text-[#7b8a96]",
    ring: "",
  },
  offline: {
    label: "오프라인",
    emoji: "●",
    dot: "bg-[#3a4a56]",
    text: "text-[#4a5a68]",
    ring: "",
  },
};

function normalizeRoleName(role: string) {
  return role.replace(/[^\p{L}\p{N}]+/gu, "").trim().toLowerCase();
}

function hasRoleKeyword(roles: string[], keywords: string[]) {
  const normalizedKeywords = keywords.map(normalizeRoleName);
  return roles.some((role) => {
    const normalizedRole = normalizeRoleName(role);
    return normalizedKeywords.some((keyword) => normalizedRole.includes(keyword));
  });
}

function getRoleGroup(roles: string[]): RoleGroup {
  if (hasRoleKeyword(roles, ADMIN_ROLE_KEYWORDS)) return "admin";
  if (hasRoleKeyword(roles, VALONEKKI_ROLE_KEYWORDS)) return "valonekki";
  return "member";
}

export default function MemberSidebar() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/members")
      .then((response) => (response.ok ? response.json() : { members: [] }))
      .then((data) => setMembers(data.members ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const admins = members.filter((member) => getRoleGroup(member.roles) === "admin");
  const valonekkis = members.filter((member) => getRoleGroup(member.roles) === "valonekki");
  const onlines = members.filter((member) => getRoleGroup(member.roles) === "member" && member.isOnline);
  const offlines = members.filter((member) => getRoleGroup(member.roles) === "member" && !member.isOnline);
  const onlineCount = members.filter((member) => member.isOnline).length;

  const sections = [
    { key: "admin", members: admins },
    { key: "valonekki", members: valonekkis },
    { key: "online", members: onlines },
    { key: "offline", members: offlines },
  ] as const satisfies ReadonlyArray<{ key: SectionKey; members: Member[] }>;

  return (
    <aside className="w-52 flex-shrink-0">
      <div className="sticky top-6 overflow-hidden rounded border border-[#2a3540] bg-[#111c24]">
        <div className="flex items-center justify-between border-b border-[#2a3540] px-3 py-2.5">
          <span className="text-[10px] uppercase tracking-widest text-[#7b8a96]">서버 멤버</span>
          {!loading && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] text-[#7b8a96]">
                {onlineCount} / {members.length}
              </span>
            </div>
          )}
        </div>

        <div
          className="member-scroll max-h-[calc(100vh-10rem)] overflow-y-auto"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,70,85,0.45) transparent",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
            </div>
          ) : members.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#7b8a96]">멤버가 없습니다.</div>
          ) : (
            <div>
              {sections.map(({ key, members: sectionMembers }) => {
                const style = SECTION_STYLES[key];

                return (
                  <div key={key}>
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
                      <span className="text-[10px]" aria-hidden="true">
                        {style.emoji}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${style.text}`}>
                        {style.label} · {sectionMembers.length}
                      </span>
                    </div>
                    {sectionMembers.map((member) => (
                      <MemberRow key={member.id} member={member} sectionKey={key} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function MemberRow({ member, sectionKey }: { member: Member; sectionKey: SectionKey }) {
  const displayName = member.name || "이름 없음";
  const initial = displayName.charAt(0).toUpperCase();
  const style = SECTION_STYLES[sectionKey];
  const isOffline = sectionKey === "offline";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.03] ${
        isOffline ? "opacity-40" : ""
      }`}
    >
      <div className="relative flex-shrink-0">
        {member.image ? (
          <img src={member.image} alt={displayName} className={`h-6 w-6 rounded-full object-cover ${style.ring}`} />
        ) : (
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-[#2a3540] text-[10px] font-bold text-[#7b8a96] ${style.ring}`}
          >
            {initial}
          </div>
        )}
        <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#111c24] ${style.dot}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-[#ece8e1]">{displayName}</div>
        {member.riotId && <div className="truncate text-[9px] text-[#4a5a68]">{member.riotId}</div>}
      </div>
    </div>
  );
}
