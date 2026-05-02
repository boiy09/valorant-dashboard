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

type RoleGroup = "관리자" | "어시스트" | "일반";
type SectionKey = "관리자" | "어시스트" | "온라인" | "오프라인";

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const ASSIST_ROLE_KEYWORDS = ["어시스트", "assistant", "assist", "staff", "스태프", "매니저"];

function normalizeRoleName(role: string) {
  return role.trim().toLowerCase();
}

function hasMatchingRole(roles: string[], keywords: string[]) {
  const normalizedRoles = roles.map(normalizeRoleName);
  return normalizedRoles.some((role) =>
    keywords.some((keyword) => role.includes(keyword.toLowerCase()))
  );
}

function getRoleGroup(roles: string[]): RoleGroup {
  if (hasMatchingRole(roles, ADMIN_ROLE_KEYWORDS)) return "관리자";
  if (hasMatchingRole(roles, ASSIST_ROLE_KEYWORDS)) return "어시스트";
  return "일반";
}

const SECTION_STYLES: Record<
  SectionKey,
  { label: string; emoji: string; dot: string; text: string; ring: string }
> = {
  관리자: {
    label: "관리자",
    emoji: "🛡️",
    dot: "bg-[#ff4655]",
    text: "text-[#ff4655]",
    ring: "ring-1 ring-[#ff4655]/60",
  },
  어시스트: {
    label: "어시스트",
    emoji: "🧩",
    dot: "bg-orange-400",
    text: "text-orange-400",
    ring: "ring-1 ring-orange-400/60",
  },
  온라인: {
    label: "온라인",
    emoji: "🟢",
    dot: "bg-green-400",
    text: "text-[#7b8a96]",
    ring: "",
  },
  오프라인: {
    label: "오프라인",
    emoji: "⚫",
    dot: "bg-[#3a4a56]",
    text: "text-[#4a5a68]",
    ring: "",
  },
};

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

  const admins = members.filter((member) => getRoleGroup(member.roles) === "관리자");
  const assists = members.filter((member) => getRoleGroup(member.roles) === "어시스트");
  const onlines = members.filter(
    (member) => getRoleGroup(member.roles) === "일반" && member.isOnline
  );
  const offlines = members.filter(
    (member) => getRoleGroup(member.roles) === "일반" && !member.isOnline
  );
  const onlineCount = members.filter((member) => member.isOnline).length;

  const sections = [
    { key: "관리자", members: admins },
    { key: "어시스트", members: assists },
    { key: "온라인", members: onlines },
    { key: "오프라인", members: offlines },
  ] as const satisfies ReadonlyArray<{ key: SectionKey; members: Member[] }>;

  return (
    <aside className="w-52 flex-shrink-0">
      <div className="sticky top-6 bg-[#111c24] border border-[#2a3540] rounded overflow-hidden">
        <div className="px-3 py-2.5 border-b border-[#2a3540] flex items-center justify-between">
          <span className="text-[#7b8a96] text-[10px] tracking-widest uppercase">서버 멤버</span>
          {!loading && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[#7b8a96] text-[10px]">
                {onlineCount} / {members.length}
              </span>
            </div>
          )}
        </div>

        <div
          className="overflow-y-auto max-h-[calc(100vh-10rem)]"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,70,85,0.3) transparent",
          }}
        >
          <style>{`
            .member-scroll::-webkit-scrollbar { width: 3px; }
            .member-scroll::-webkit-scrollbar-track { background: transparent; }
            .member-scroll::-webkit-scrollbar-thumb { background: rgba(255,70,85,0.3); border-radius: 2px; }
            .member-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,70,85,0.6); }
          `}</style>

          {loading ? (
            <div className="p-4 flex items-center justify-center">
              <div className="w-2.5 h-2.5 border-2 border-[#ff4655] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="p-4 text-center text-[#7b8a96] text-xs">멤버 없음</div>
          ) : (
            <div className="member-scroll overflow-y-auto max-h-[calc(100vh-10rem)]">
              {sections.map(({ key, members: sectionMembers }) => {
                const style = SECTION_STYLES[key];

                return (
                  <div key={key}>
                    <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                      <span className="text-[10px]" aria-hidden="true">
                        {style.emoji}
                      </span>
                      <span className={`text-[9px] tracking-widest uppercase font-bold ${style.text}`}>
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
  const displayName = member.name || "?";
  const initial = displayName.charAt(0).toUpperCase();
  const style = SECTION_STYLES[sectionKey];
  const isOffline = sectionKey === "오프라인";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors ${
        isOffline ? "opacity-40" : ""
      }`}
    >
      <div className="relative flex-shrink-0">
        {member.image ? (
          <img
            src={member.image}
            alt={displayName}
            className={`w-6 h-6 rounded-full object-cover ${style.ring}`}
          />
        ) : (
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#2a3540] text-[#7b8a96] ${style.ring}`}
          >
            {initial}
          </div>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#111c24] ${style.dot}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#ece8e1] truncate">{displayName}</div>
        {member.riotId && <div className="text-[9px] text-[#4a5a68] truncate">{member.riotId}</div>}
      </div>
    </div>
  );
}
