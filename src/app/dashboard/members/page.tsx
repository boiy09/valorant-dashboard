"use client";

import { useState, useEffect } from "react";

interface Member {
  id: string;
  name: string | null;
  image: string | null;
  discordId: string | null;
  roles: string[];
  riotId: string | null;
  joinedAt: string;
}

const ADMIN_ROLES = ["관리자", "어시스트"];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [guildName, setGuildName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/members")
      .then(r => r.json())
      .then(d => {
        setMembers(d.members ?? []);
        setGuildName(d.guildName ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = members.filter(m =>
    !search || (m.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (m.riotId ?? "").toLowerCase().includes(search.toLowerCase()) ||
    m.roles.some(r => r.toLowerCase().includes(search.toLowerCase()))
  );

  const admins = filtered.filter(m => m.roles.some(r => ADMIN_ROLES.includes(r)));
  const rest = filtered.filter(m => !m.roles.some(r => ADMIN_ROLES.includes(r)));

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">서버 멤버</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          {guildName ? `${guildName} · ` : ""}총 {members.length}명
        </p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : members.length === 0 ? (
        <div className="val-card p-12 text-center">
          <div className="text-[#7b8a96] text-sm mb-2">멤버 데이터가 없어요</div>
          <div className="text-[#7b8a96] text-xs">Discord 봇이 서버에 참가하면 자동으로 멤버 목록이 동기화돼요</div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름, 라이엇 ID, 역할로 검색..."
              className="val-input w-full max-w-sm px-4 py-2.5 text-sm text-white bg-[#1a242d] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655]"
            />
          </div>

          {admins.length > 0 && (
            <div className="mb-6">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">관리진 ({admins.length})</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {admins.map(m => <MemberCard key={m.id} member={m} highlight />)}
              </div>
            </div>
          )}

          <div>
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">멤버 ({rest.length})</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {rest.map(m => <MemberCard key={m.id} member={m} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({ member, highlight }: { member: Member; highlight?: boolean }) {
  return (
    <div className={`val-card p-4 flex items-center gap-3 ${highlight ? "border-l-2 border-l-[#ff4655]" : ""}`}>
      {member.image
        ? <img src={member.image} alt={member.name ?? ""} className="w-10 h-10 rounded-full flex-shrink-0" />
        : <div className="w-10 h-10 rounded-full bg-[#2a3540] flex items-center justify-center text-sm text-[#7b8a96] flex-shrink-0">
            {member.name?.[0] ?? "?"}
          </div>
      }
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-bold truncate">{member.name ?? "알 수 없음"}</div>
        {member.riotId && (
          <div className="text-[#ff4655] text-xs truncate">{member.riotId}</div>
        )}
        {member.roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {member.roles.slice(0, 3).map(r => (
              <span key={r}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  ADMIN_ROLES.includes(r)
                    ? "text-[#ff4655] bg-[#ff4655]/10"
                    : "text-[#7b8a96] bg-[#1a242d]"
                }`}>
                {r}
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
