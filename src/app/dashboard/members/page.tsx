"use client";

import { useEffect, useMemo, useState } from "react";

interface Member {
  id: string;
  name: string | null;
  image: string | null;
  discordId: string | null;
  roles: string[];
  riotId: string | null;
  joinedAt: string;
}

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const ASSIST_ROLE_KEYWORDS = ["어시스트", "assistant", "assist", "staff", "스태프", "매니저"];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function hasKeywordMatch(values: string[], keywords: string[]) {
  const normalizedValues = values.map(normalizeText);
  return normalizedValues.some((value) =>
    keywords.some((keyword) => value.includes(keyword.toLowerCase()))
  );
}

function getRoleGroup(roles: string[]) {
  if (hasKeywordMatch(roles, ADMIN_ROLE_KEYWORDS)) return "관리자";
  if (hasKeywordMatch(roles, ASSIST_ROLE_KEYWORDS)) return "어시스트";
  return "멤버";
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [guildName, setGuildName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/members")
      .then((response) => response.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setGuildName(data.guildName ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const roleOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const member of members) {
      for (const role of member.roles) {
        const trimmed = role.trim();
        if (!trimmed) continue;
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0], "ko-KR");
      })
      .map(([role, count]) => ({ role, count }));
  }, [members]);

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return members.filter((member) => {
      const matchesSearch =
        !keyword ||
        (member.name ?? "").toLowerCase().includes(keyword) ||
        (member.riotId ?? "").toLowerCase().includes(keyword) ||
        member.roles.some((role) => role.toLowerCase().includes(keyword));

      const matchesRole =
        selectedRole === "all" || member.roles.some((role) => role === selectedRole);

      return matchesSearch && matchesRole;
    });
  }, [members, search, selectedRole]);

  const admins = filteredMembers.filter((member) => getRoleGroup(member.roles) === "관리자");
  const assists = filteredMembers.filter((member) => getRoleGroup(member.roles) === "어시스트");
  const rest = filteredMembers.filter((member) => getRoleGroup(member.roles) === "멤버");

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">서버 멤버</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          {guildName ? `${guildName} · ` : ""}
          총 {members.length}명
        </p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
      ) : members.length === 0 ? (
        <div className="val-card p-12 text-center">
          <div className="text-[#7b8a96] text-sm mb-2">멤버 데이터가 아직 없어요.</div>
          <div className="text-[#7b8a96] text-xs">
            Discord 봇이 서버 멤버를 다시 동기화하면 목록이 채워집니다.
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 라이엇 ID, 역할로 검색..."
              className="val-input w-full px-4 py-2.5 text-sm text-white bg-[#1a242d] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655]"
            />

            <div className="bg-[#111c24] border border-[#2a3540] rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-[#2a3540] flex items-center justify-between">
                <span className="text-[#7b8a96] text-[10px] tracking-widest uppercase">
                  🎭 역할 필터
                </span>
                <span className="text-[#7b8a96] text-[10px]">
                  {selectedRole === "all" ? "전체" : selectedRole}
                </span>
              </div>
              <div className="px-3 py-2.5">
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  className="val-input w-full px-3 py-2 text-sm text-white bg-[#1a242d] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655]"
                >
                  <option value="all">전체 역할</option>
                  {roleOptions.map((option) => (
                    <option key={option.role} value={option.role}>
                      {option.role} ({option.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {admins.length > 0 && (
            <div className="mb-6">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">
                🛡️ 관리자 ({admins.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {admins.map((member) => (
                  <MemberCard key={member.id} member={member} highlight />
                ))}
              </div>
            </div>
          )}

          {assists.length > 0 && (
            <div className="mb-6">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">
                🧩 어시스트 ({assists.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {assists.map((member) => (
                  <MemberCard key={member.id} member={member} highlight />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">
              👥 멤버 ({rest.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {rest.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({ member, highlight }: { member: Member; highlight?: boolean }) {
  return (
    <div
      className={`val-card p-4 flex items-center gap-3 ${
        highlight ? "border-l-2 border-l-[#ff4655]" : ""
      }`}
    >
      {member.image ? (
        <img
          src={member.image}
          alt={member.name ?? ""}
          className="w-10 h-10 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#2a3540] flex items-center justify-center text-sm text-[#7b8a96] flex-shrink-0">
          {member.name?.[0] ?? "?"}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-bold truncate">{member.name ?? "이름 없음"}</div>
        {member.riotId && <div className="text-[#ff4655] text-xs truncate">{member.riotId}</div>}
        {member.roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {member.roles.slice(0, 3).map((role) => (
              <span
                key={role}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  getRoleGroup(member.roles) !== "멤버"
                    ? "text-[#ff4655] bg-[#ff4655]/10"
                    : "text-[#7b8a96] bg-[#1a242d]"
                }`}
              >
                {role}
              </span>
            ))}
            {member.roles.length > 3 && (
              <span className="text-[10px] text-[#7b8a96]">+{member.roles.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
