"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Warning {
  id: string;
  userId: string;
  reason: string;
  issuedBy: string;
  active: boolean;
  note: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null };
}

interface ServerRecord {
  userId: string;
  discordId: string | null;
  name: string;
  image: string | null;
  voiceSeconds: number;
  voiceTime: string;
  attendanceDays: number;
  rejoinCount: number;
}

interface RoleMember {
  discordId: string | null;
  name: string | null;
  image: string | null;
  roles: string[];
}

type AdminAction = "sync-members" | "restart-bot";
type AdminView = "server-records" | "warnings";

// 두끼/공복 역할 이름 매핑
const WARNING_ROLES: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "두끼", color: "#f59e0b", bg: "#f59e0b22" },
  2: { label: "공복", color: "#ff4655", bg: "#ff465522" },
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(1);
  return toDateInputValue(date);
}

export default function AdminPage() {
  const [view, setView] = useState<AdminView>("server-records");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [records, setRecords] = useState<ServerRecord[]>([]);
  const [roleMembers, setRoleMembers] = useState<RoleMember[]>([]);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    fetch("/api/me/roles")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin ?? false))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);

    const endpoint =
      view === "server-records"
        ? `/api/admin/server-records?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
        : "/api/warnings";

    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (view === "server-records") setRecords(d.records ?? []);
        else setWarnings(d.warnings ?? []);
      })
      .catch(() => {
        if (view === "server-records") setRecords([]);
        else setWarnings([]);
      })
      .finally(() => setLoading(false));
  }, [view, startDate, endDate, isAdmin]);

  // 경고 뷰에서 두끼/공복 역할 보유자 자동 로드
  useEffect(() => {
    if (view !== "warnings" || !isAdmin) return;

    fetch("/api/members", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const members: RoleMember[] = (d.members ?? []).filter((m: RoleMember) =>
          m.roles.some((role) => {
            const r = role.replace(/\s/g, "").toLowerCase();
            return r.includes("두끼") || r.includes("공복");
          })
        );
        setRoleMembers(members);
      })
      .catch(() => setRoleMembers([]));
  }, [view, isAdmin]);

  const totals = useMemo(
    () => ({
      voiceSeconds: records.reduce((s, r) => s + r.voiceSeconds, 0),
      attendanceDays: records.reduce((s, r) => s + r.attendanceDays, 0),
      rejoinCount: records.reduce((s, r) => s + r.rejoinCount, 0),
    }),
    [records]
  );

  async function runAdminAction(action: AdminAction) {
    setActionLoading(action);
    setActionMessage("");
    try {
      const r = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      setActionMessage(d.message ?? d.error ?? "작업이 완료되었습니다.");
    } catch {
      setActionMessage("작업 요청 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleNoteUpdate(warningId: string, note: string | null) {
    setWarnings((prev) =>
      prev.map((w) => (w.id === warningId ? { ...w, note } : w))
    );
  }

  if (isAdmin === null) {
    return <div className="val-card p-12 text-center text-[#7b8a96]">권한 확인 중...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="val-card p-12 text-center">
        <div className="mb-2 text-lg font-bold text-white">접근 권한 없음</div>
        <div className="text-sm text-[#7b8a96]">관리자 또는 발로네끼 역할이 있어야 접근할 수 있습니다.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">관리</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">서버 기록, 경고 내역, 봇 운영 작업을 관리합니다.</p>
      </div>

      <div className="val-card mb-6 p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Bot Operations</div>
          <div className="mt-1 text-sm text-[#c8d3db]">Discord 멤버/역할 정보를 갱신하거나 봇을 재시작합니다.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAdminAction("sync-members")}
            disabled={actionLoading !== null}
            className="val-btn bg-[#ff4655] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {actionLoading === "sync-members" ? "갱신 중..." : "멤버/역할 갱신"}
          </button>
          <button
            type="button"
            onClick={() => runAdminAction("restart-bot")}
            disabled={actionLoading !== null}
            className="val-btn bg-[#1a242d] px-4 py-2 text-sm font-bold text-[#c8d3db] hover:text-white disabled:opacity-50"
          >
            {actionLoading === "restart-bot" ? "요청 중..." : "봇 재시작"}
          </button>
        </div>
        {actionMessage && (
          <div className="mt-3 border-l-2 border-[#ff4655] bg-[#111c24] px-3 py-2 text-sm text-[#c8d3db]">
            {actionMessage}
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              ["server-records", "서버 기록"],
              ["warnings", "경고 내역"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={`val-btn px-5 py-2 text-sm font-medium ${
                view === value ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "server-records" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8da0ad]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-white"
            />
            <span>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-white"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
      ) : view === "server-records" ? (
        <ServerRecordsTable records={records} totals={totals} />
      ) : (
        <WarningsList warnings={warnings} roleMembers={roleMembers} onNoteUpdate={handleNoteUpdate} />
      )}
    </div>
  );
}

// ─── 역할 규칙 안내 배너 ───────────────────────────────────────────────────────
function WarningRulesBanner() {
  return (
    <div className="val-card mb-4 p-4">
      <div className="mb-2 text-xs uppercase tracking-widest text-[#7b8a96]">경고 규칙</div>
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2">
          <span className="text-base">⚠</span>
          <div>
            <div className="text-xs font-bold text-[#f59e0b]">경고 1회</div>
            <div className="text-xs text-[#c8d3db]">두끼 역할 지급</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-3 py-2">
          <span className="text-base">⛔</span>
          <div>
            <div className="text-xs font-bold text-[#ff4655]">경고 2회</div>
            <div className="text-xs text-[#c8d3db]">공복 역할 지급</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 두끼/공복 역할 보유자 카드 ────────────────────────────────────────────────
function RoleHoldersCard({ members }: { members: RoleMember[] }) {
  const dukkiMembers = members.filter((m) =>
    m.roles.some((r) => r.replace(/\s/g, "").toLowerCase().includes("두끼"))
  );
  const gongbokMembers = members.filter((m) =>
    m.roles.some((r) => r.replace(/\s/g, "").toLowerCase().includes("공복"))
  );

  if (members.length === 0) return null;

  function MemberChip({ member }: { member: RoleMember }) {
    return (
      <div className="flex items-center gap-1.5 rounded bg-[#0f1923] px-2 py-1">
        {member.image ? (
          <img src={member.image} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2a3540] text-[9px] text-[#7b8a96]">
            {member.name?.[0] ?? "?"}
          </div>
        )}
        <span className="text-xs text-[#ece8e1]">{member.name ?? "알 수 없음"}</span>
      </div>
    );
  }

  return (
    <div className="val-card mb-4 p-4">
      <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">역할 보유자 현황</div>
      <div className="flex flex-col gap-3">
        {dukkiMembers.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-2 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                두끼
              </span>
              <span className="text-xs text-[#7b8a96]">{dukkiMembers.length}명</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dukkiMembers.map((m) => (
                <MemberChip key={m.discordId ?? m.name} member={m} />
              ))}
            </div>
          </div>
        )}
        {gongbokMembers.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded border border-[#ff4655]/40 bg-[#ff4655]/15 px-2 py-0.5 text-[11px] font-bold text-[#ff4655]">
                공복
              </span>
              <span className="text-xs text-[#7b8a96]">{gongbokMembers.length}명</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gongbokMembers.map((m) => (
                <MemberChip key={m.discordId ?? m.name} member={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메모 인라인 편집 ──────────────────────────────────────────────────────────
function NoteEditor({
  warningId,
  note,
  onSaved,
}: {
  warningId: string;
  note: string | null;
  onSaved: (note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setValue(note ?? "");
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/warnings/${warningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: value }),
      });
      if (r.ok) {
        onSaved(value.trim() || null);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="메모를 입력하세요..."
          rows={2}
          className="w-full resize-none rounded border border-[#263442] bg-[#0f1923] px-2.5 py-1.5 text-xs text-white placeholder-[#4a5d6b] focus:border-[#ff4655]/60 focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-[#ff4655] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded bg-[#1a242d] px-3 py-1 text-[11px] text-[#7b8a96] hover:text-white"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={startEdit}
      className="group mt-1 flex cursor-pointer items-start gap-1 rounded px-1 py-0.5 hover:bg-[#1a242d]"
      title="클릭하여 메모 편집"
    >
      <span className="mt-0.5 shrink-0 text-[10px] text-[#4a5d6b] group-hover:text-[#7b8a96]">✎</span>
      {note ? (
        <span className="text-xs text-[#8da0ad]">{note}</span>
      ) : (
        <span className="text-xs italic text-[#4a5d6b] group-hover:text-[#7b8a96]">메모 추가...</span>
      )}
    </div>
  );
}

// ─── 경고 목록 ─────────────────────────────────────────────────────────────────
function WarningsList({
  warnings,
  roleMembers,
  onNoteUpdate,
}: {
  warnings: Warning[];
  roleMembers: RoleMember[];
  onNoteUpdate: (warningId: string, note: string | null) => void;
}) {
  // 유저별로 그룹화
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { user: Warning["user"]; userId: string; warnings: Warning[] }
    >();
    for (const w of warnings) {
      if (!map.has(w.userId)) {
        map.set(w.userId, { user: w.user, userId: w.userId, warnings: [] });
      }
      map.get(w.userId)!.warnings.push(w);
    }
    // 활성 경고 많은 순 정렬
    return Array.from(map.values()).sort(
      (a, b) =>
        b.warnings.filter((w) => w.active).length -
        a.warnings.filter((w) => w.active).length
    );
  }, [warnings]);

  return (
    <div>
      <WarningRulesBanner />
      <RoleHoldersCard members={roleMembers} />

      {warnings.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">경고 내역이 없습니다.</div>
      ) : (
        <div className="val-card p-5">
          <div className="mb-4 text-xs uppercase tracking-widest text-[#7b8a96]">
            경고 내역 ({warnings.length}건 / {grouped.length}명)
          </div>
          <div className="flex flex-col gap-4">
            {grouped.map(({ user, userId, warnings: userWarnings }) => {
              const activeCount = userWarnings.filter((w) => w.active).length;
              const roleInfo = WARNING_ROLES[activeCount] ?? null;

              return (
                <div key={userId} className="rounded border border-[#263442] bg-[#0a1520]/60 p-4">
                  {/* 유저 헤더 */}
                  <div className="mb-3 flex items-center gap-3">
                    {user.image ? (
                      <img src={user.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#7b8a96]">
                        {user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{user.name ?? "알 수 없음"}</span>
                      <span className="text-xs text-[#7b8a96]">
                        활성 경고 {activeCount}회 / 전체 {userWarnings.length}회
                      </span>
                      {roleInfo && (
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold"
                          style={{
                            color: roleInfo.color,
                            borderColor: roleInfo.color + "50",
                            background: roleInfo.bg,
                          }}
                        >
                          {roleInfo.label} 역할 대상
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 경고 목록 */}
                  <div className="flex flex-col gap-2 pl-1">
                    {userWarnings.map((w, idx) => (
                      <div
                        key={w.id}
                        className={`rounded border p-3 ${
                          w.active
                            ? "border-[#ff4655]/20 bg-[#ff4655]/5"
                            : "border-[#263442]/60 bg-[#0f1923]/40 opacity-60"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                                w.active
                                  ? "bg-[#ff4655]/20 text-[#ff4655]"
                                  : "bg-[#263442] text-[#7b8a96]"
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="text-sm text-[#c8d3db]">{w.reason}</div>
                              <NoteEditor
                                warningId={w.id}
                                note={w.note}
                                onSaved={(note) => onNoteUpdate(w.id, note)}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-[#7b8a96]">
                              {new Date(w.createdAt).toLocaleDateString("ko-KR", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              })}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#4a5d6b]">by {w.issuedBy}</div>
                            {!w.active && (
                              <div className="mt-0.5 text-[11px] font-bold text-green-400">해제됨</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 서버 기록 ─────────────────────────────────────────────────────────────────
function ServerRecordsTable({
  records,
  totals,
}: {
  records: ServerRecord[];
  totals: { voiceSeconds: number; attendanceDays: number; rejoinCount: number };
}) {
  return (
    <div className="val-card p-5">
      <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Summary
          label="기간 내 총 통화"
          value={`${Math.floor(totals.voiceSeconds / 3600)}시간 ${Math.floor((totals.voiceSeconds % 3600) / 60)}분`}
        />
        <Summary label="기간 내 총 출석" value={`${totals.attendanceDays}일`} />
        <Summary label="전체 재입장 기록" value={`${totals.rejoinCount}회`} />
      </div>

      {records.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#7b8a96]">서버 기록이 없습니다.</div>
      ) : (
        <div className="member-scroll max-h-[620px] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 bg-[#111c24] text-xs uppercase tracking-widest text-[#7b8a96]">
              <tr>
                <th className="border-b border-[#263442] px-3 py-3 text-left">멤버</th>
                <th className="border-b border-[#263442] px-3 py-3 text-right">통화 시간</th>
                <th className="border-b border-[#263442] px-3 py-3 text-right">출석 일수</th>
                <th className="border-b border-[#263442] px-3 py-3 text-right">재입장 횟수</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.userId} className="border-b border-[#263442]/70 last:border-b-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      {record.image ? (
                        <img src={record.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#8da0ad]">
                          {record.name[0] ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-bold text-white">{record.name}</div>
                        <div className="truncate text-xs text-[#7b8a96]">{record.discordId ?? "Discord ID 없음"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#ece8e1]">{record.voiceTime}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#00e787]">{record.attendanceDays}일</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#ff4655]">{record.rejoinCount}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#263442] bg-[#0f1923]/70 px-4 py-3">
      <div className="text-xs uppercase tracking-widest text-[#7b8a96]">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}
