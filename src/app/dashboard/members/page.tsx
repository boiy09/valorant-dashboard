"use client";

import { useEffect, useMemo, useState } from "react";

interface RiotAccountSummary {
  region: "KR" | "AP";
  riotId: string;
  level: number | null;
  card: string | null;
  tier: string;
  rankIcon: string | null;
}

interface Member {
  id: string;
  name: string | null;
  image: string | null;
  discordId: string | null;
  roles: string[];
  riotId: string | null;
  riotAccounts: RiotAccountSummary[];
  joinedAt: string;
}

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const ASSIST_ROLE_KEYWORDS = ["어시스트", "assistant", "assist", "staff", "스태프", "매니저"];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function hasKeywordMatch(values: string[], keywords: string[]) {
  const normalizedValues = values.map(normalizeText);
  return normalizedValues.some((value) => keywords.some((keyword) => value.includes(keyword.toLowerCase())));
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
        member.riotAccounts.some((account) => account.riotId.toLowerCase().includes(keyword)) ||
        member.roles.some((role) => role.toLowerCase().includes(keyword));

      const matchesRole = selectedRole === "all" || member.roles.some((role) => role === selectedRole);

      return matchesSearch && matchesRole;
    });
  }, [members, search, selectedRole]);

  const admins = filteredMembers.filter((member) => getRoleGroup(member.roles) === "관리자");
  const assists = filteredMembers.filter((member) => getRoleGroup(member.roles) === "어시스트");
  const rest = filteredMembers.filter((member) => getRoleGroup(member.roles) === "멤버");

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">서버 멤버</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">
          {guildName ? `${guildName} · ` : ""}
          총 {members.length}명
        </p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
      ) : members.length === 0 ? (
        <div className="val-card p-12 text-center">
          <div className="mb-2 text-sm text-[#7b8a96]">멤버 데이터가 아직 없습니다.</div>
          <div className="text-xs text-[#7b8a96]">관리 탭에서 멤버/역할 갱신을 실행해 주세요.</div>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, Riot ID, 역할로 검색..."
              className="val-input w-full rounded border border-[#2a3540] bg-[#1a242d] px-4 py-2.5 text-sm text-white focus:border-[#ff4655] focus:outline-none"
            />

            <div className="overflow-hidden rounded border border-[#2a3540] bg-[#111c24]">
              <div className="flex items-center justify-between border-b border-[#2a3540] px-3 py-2">
                <span className="text-[10px] uppercase tracking-widest text-[#7b8a96]">역할 필터</span>
                <span className="text-[10px] text-[#7b8a96]">{selectedRole === "all" ? "전체" : selectedRole}</span>
              </div>
              <div className="px-3 py-2.5">
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  className="val-input w-full rounded border border-[#2a3540] bg-[#1a242d] px-3 py-2 text-sm text-white focus:border-[#ff4655] focus:outline-none"
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

          <MemberSection title="관리자" members={admins} highlight />
          <MemberSection title="어시스트" members={assists} highlight />
          <MemberSection title="멤버" members={rest} />
        </>
      )}
    </div>
  );
}

function MemberSection({ title, members, highlight }: { title: string; members: Member[]; highlight?: boolean }) {
  if (members.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">
        {title} ({members.length})
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {members.map((member) => (
          <MemberCard key={member.id} member={member} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

function MemberCard({ member, highlight }: { member: Member; highlight?: boolean }) {
  return (
    <div className={`val-card p-4 ${highlight ? "border-l-2 border-l-[#ff4655]" : ""}`}>
      <div className="flex items-center gap-3">
        {member.image ? (
          <img src={member.image} alt={member.name ?? ""} className="h-10 w-10 flex-shrink-0 rounded-full" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2a3540] text-sm text-[#7b8a96]">
            {member.name?.[0] ?? "?"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{member.name ?? "이름 없음"}</div>
          {member.roles.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {member.roles.map((role) => (
                <span
                  key={role}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    getRoleGroup(member.roles) !== "멤버"
                      ? "bg-[#ff4655]/10 text-[#ff4655]"
                      : "bg-[#1a242d] text-[#7b8a96]"
                  }`}
                >
                  {role}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {member.riotAccounts.length > 0 ? (
          member.riotAccounts.map((account) => (
            <RiotAccountRow key={`${account.region}:${account.riotId}`} account={account} />
          ))
        ) : (
          <div className="rounded border border-[#263442] bg-[#0b1721]/60 px-3 py-2 text-xs text-[#7b8a96]">
            Riot 계정 미연동
          </div>
        )}
      </div>
    </div>
  );
}

function RiotAccountRow({ account }: { account: RiotAccountSummary }) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-[#263442] bg-[#0b1721]/70 p-2">
      <div className="relative h-10 w-10 overflow-hidden rounded bg-[#172431]">
        {account.card ? (
          <img src={account.card} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-[#7b8a96]">CARD</div>
        )}
        <span className="absolute bottom-0 left-0 bg-black/75 px-1 text-[9px] font-black text-white">
          {account.level ?? "-"}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[#ff4655]/15 px-1.5 py-0.5 text-[9px] font-black text-[#ff4655]">
            {account.region}
          </span>
          <span className="member-riot-marquee min-w-0 flex-1 text-xs font-bold text-white" title={account.riotId}>
            <span>{account.riotId}</span>
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-[#7b8a96]">Lv. {account.level ?? "-"}</div>
      </div>

      <div className="flex items-center gap-1.5">
        {account.rankIcon ? (
          <img src={account.rankIcon} alt="" className="h-6 w-6 object-contain" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-[#263442]" />
        )}
        <span className="max-w-[72px] truncate text-[10px] font-bold text-[#8da0ad]">{account.tier}</span>
      </div>
    </div>
  );
}
