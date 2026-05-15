"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AdminView = "server-records" | "warnings" | "newbies";
type AdminAction = "sync-members" | "restart-bot";
type RecordType = "warning" | "complaint";

interface AdminRecord {
  id: string;
  userId: string;
  reason: string;
  issuedBy: string;
  active: boolean;
  note: string | null;
  type: RecordType;
  createdAt: string;
  updatedAt?: string;
  user: { name: string | null; image: string | null; discordId: string | null };
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

interface Member {
  discordId: string | null;
  name: string | null;
  image: string | null;
  roles: string[];
}

interface AdminNote {
  id: string;
  targetDiscordId: string;
  content: string;
  issuedBy: string;
  createdAt: string;
  updatedAt?: string;
}

const TABS: Array<[AdminView, string]> = [
  ["server-records", "서버 기록"],
  ["warnings", "경고"],
  ["newbies", "신입"],
];

function normalizeRole(role: string) {
  return role.replace(/\s/g, "").toLowerCase();
}

function hasRole(member: Member, keyword: string) {
  const normalized = keyword.replace(/\s/g, "").toLowerCase();
  return member.roles.some((role) => normalizeRole(role).includes(normalized));
}

function isWarningRoleHolder(member: Member) {
  return hasRole(member, "두끼") || hasRole(member, "공복");
}

function newbieGroup(member: Member): "probation" | "newbie" | null {
  if (hasRole(member, "웰컴수습")) return "probation";
  if (hasRole(member, "신입")) return "newbie";
  return null;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function recordLabel(type: RecordType) {
  return type === "complaint" ? "민원" : "경고";
}

function recordColor(type: RecordType) {
  return type === "complaint"
    ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]"
    : "border-[#ff4655]/40 bg-[#ff4655]/10 text-[#ff4655]";
}

export default function AdminPage() {
  const [view, setView] = useState<AdminView>("server-records");
  const [records, setRecords] = useState<ServerRecord[]>([]);
  const [adminRecords, setAdminRecords] = useState<AdminRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return toDateInputValue(date);
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [modal, setModal] = useState<{ type: RecordType; member?: Member; record?: AdminRecord } | null>(null);

  useEffect(() => {
    fetch("/api/me/roles")
      .then((response) => response.json())
      .then((data) => setIsAdmin(Boolean(data.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    const endpoint =
      view === "server-records"
        ? `/api/admin/server-records?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
        : "/api/warnings?limit=500";

    fetch(endpoint, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (view === "server-records") setRecords(data.records ?? []);
        else setAdminRecords(data.warnings ?? []);
      })
      .catch(() => {
        if (view === "server-records") setRecords([]);
        else setAdminRecords([]);
      })
      .finally(() => setLoading(false));
  }, [view, startDate, endDate, isAdmin]);

  useEffect(() => {
    if (!isAdmin || view === "server-records") return;
    fetch("/api/members", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, [view, isAdmin]);

  const totals = useMemo(
    () => ({
      voiceSeconds: records.reduce((sum, record) => sum + record.voiceSeconds, 0),
      attendanceDays: records.reduce((sum, record) => sum + record.attendanceDays, 0),
      rejoinCount: records.reduce((sum, record) => sum + record.rejoinCount, 0),
    }),
    [records]
  );

  async function runAdminAction(action: AdminAction) {
    setActionLoading(action);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      setActionMessage(data.message ?? data.error ?? "작업이 완료되었습니다.");
    } catch {
      setActionMessage("작업 요청 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  async function saveAdminRecord(payload: {
    id?: string;
    discordId?: string;
    type: RecordType;
    reason: string;
    note: string;
    issuedBy: string;
    active: boolean;
  }) {
    const isEdit = Boolean(payload.id);
    const response = await fetch(isEdit ? `/api/warnings/${payload.id}` : "/api/warnings", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");

    if (isEdit) {
      setAdminRecords((prev) =>
        prev.map((record) =>
          record.id === payload.id
            ? {
                ...record,
                reason: payload.reason,
                note: payload.note.trim() || null,
                issuedBy: payload.issuedBy.trim() || "관리자",
                active: payload.active,
                type: payload.type,
              }
            : record
        )
      );
    } else if (data.warning) {
      setAdminRecords((prev) => [data.warning, ...prev]);
    }
    setModal(null);
  }

  async function deleteAdminRecord(record: AdminRecord) {
    if (!confirm(`${recordLabel(record.type)} 기록을 삭제할까요?`)) return;
    const response = await fetch(`/api/warnings/${record.id}`, { method: "DELETE" });
    if (response.ok) setAdminRecords((prev) => prev.filter((item) => item.id !== record.id));
  }

  if (isAdmin === null) return <div className="val-card p-12 text-center text-[#7b8a96]">권한 확인 중...</div>;
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
        <p className="mt-0.5 text-sm text-[#7b8a96]">서버 기록, 경고, 신입 상태와 관리자 메모를 관리합니다.</p>
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
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`val-btn px-5 py-2 text-sm font-medium ${
                view === value ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "server-records" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8da0ad]">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-white" />
            <span>~</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-white" />
          </div>
        ) : view === "warnings" ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setModal({ type: "warning" })} className="val-btn bg-[#ff4655] px-4 py-2 text-sm font-bold text-white">
              +경고
            </button>
            <button type="button" onClick={() => setModal({ type: "complaint" })} className="val-btn bg-[#f59e0b] px-4 py-2 text-sm font-bold text-[#111827]">
              +민원
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
      ) : view === "server-records" ? (
        <ServerRecordsTable records={records} totals={totals} />
      ) : view === "warnings" ? (
        <WarningsTab
          records={adminRecords}
          roleMembers={members.filter(isWarningRoleHolder)}
          onAdd={(type, member) => setModal({ type, member })}
          onEdit={(record) => setModal({ type: record.type, record })}
          onDelete={deleteAdminRecord}
        />
      ) : (
        <NewbiesTab
          members={members}
        />
      )}

      {modal && (
        <RecordModal
          members={members}
          modal={modal}
          onSubmit={saveAdminRecord}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function MemberAvatar({ member, size = "h-8 w-8" }: { member: Pick<Member, "name" | "image">; size?: string }) {
  if (member.image) return <img src={member.image} alt="" className={`${size} rounded-full object-cover`} />;
  return (
    <div className={`${size} flex items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#8da0ad]`}>
      {member.name?.[0] ?? "?"}
    </div>
  );
}

function RecordModal({
  members,
  modal,
  onSubmit,
  onClose,
}: {
  members: Member[];
  modal: { type: RecordType; member?: Member; record?: AdminRecord };
  onSubmit: (payload: { id?: string; discordId?: string; type: RecordType; reason: string; note: string; issuedBy: string; active: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(modal.member?.discordId ?? modal.record?.user.discordId ?? "");
  const [search, setSearch] = useState(modal.member?.name ?? modal.record?.user.name ?? "");
  const [reason, setReason] = useState(modal.record?.reason ?? "");
  const [note, setNote] = useState(modal.record?.note ?? "");
  const [issuedBy, setIssuedBy] = useState(modal.record?.issuedBy ?? "관리자");
  const [active, setActive] = useState(modal.record?.active ?? true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredMembers = useMemo(
    () => members.filter((member) => !search || (member.name ?? "").toLowerCase().includes(search.toLowerCase())).slice(0, 50),
    [members, search]
  );
  const selectedMember = members.find((member) => member.discordId === selectedId) ?? null;
  const label = recordLabel(modal.type);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!modal.record && !selectedId) return setError("멤버를 선택해 주세요.");
    if (!reason.trim()) return setError(`${label} 내용을 입력해 주세요.`);
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        id: modal.record?.id,
        discordId: selectedId,
        type: modal.type,
        reason,
        note,
        issuedBy,
        active,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="val-card w-full max-w-md p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#ff4655]">Admin</div>
            <h2 className="text-lg font-black text-white">{modal.record ? `${label} 수정` : `${label} 작성`}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded text-[#7b8a96] hover:bg-[#1a242d] hover:text-white">
            X
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!modal.record && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">멤버</label>
              <div className="relative" ref={dropdownRef}>
                <div className="flex items-center gap-2 rounded border border-[#263442] bg-[#0f1923] px-3 py-2 focus-within:border-[#ff4655]/60">
                  {selectedMember && <MemberAvatar member={selectedMember} size="h-5 w-5" />}
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setDropdownOpen(true);
                      setSelectedId("");
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="멤버 이름 검색"
                    className="flex-1 bg-transparent text-sm text-white placeholder-[#4a5d6b] focus:outline-none"
                  />
                </div>
                {dropdownOpen && filteredMembers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded border border-[#263442] bg-[#111c24] shadow-xl">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.discordId ?? member.name}
                        type="button"
                        onMouseDown={() => {
                          setSelectedId(member.discordId ?? "");
                          setSearch(member.name ?? "");
                          setDropdownOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#c8d3db] hover:bg-[#1a242d] hover:text-white"
                      >
                        <MemberAvatar member={member} size="h-5 w-5" />
                        <span>{member.name ?? "알 수 없음"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">{label} 내용</label>
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white focus:border-[#ff4655]/60 focus:outline-none" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">메모</label>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full resize-none rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white focus:border-[#ff4655]/60 focus:outline-none" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">작성자</label>
            <input value={issuedBy} onChange={(event) => setIssuedBy(event.target.value)} className="w-full rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white focus:border-[#ff4655]/60 focus:outline-none" />
          </div>

          {modal.record && (
            <label className="flex items-center gap-2 text-sm text-[#c8d3db]">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              활성 상태
            </label>
          )}

          {error && <div className="rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-3 py-2 text-sm text-[#ff8b95]">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting} className="flex-1 rounded bg-[#ff4655] py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {submitting ? "저장 중..." : "저장"}
            </button>
            <button type="button" onClick={onClose} className="rounded bg-[#1a242d] px-5 py-2.5 text-sm text-[#7b8a96] hover:text-white">
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WarningsTab({
  records,
  roleMembers,
  onAdd,
  onEdit,
  onDelete,
}: {
  records: AdminRecord[];
  roleMembers: Member[];
  onAdd: (type: RecordType, member?: Member) => void;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  return (
    <div className="space-y-4">
      <RoleHoldersCard members={roleMembers} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
      <AdminRecordsList records={records} onEdit={onEdit} onDelete={onDelete} title="경고 내역" />
    </div>
  );
}

function RoleHoldersCard({
  members,
  records,
  onAdd,
  onEdit,
  onDelete,
}: {
  members: Member[];
  records: AdminRecord[];
  onAdd: (type: RecordType, member?: Member) => void;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  const dukki = members.filter((member) => hasRole(member, "두끼"));
  const gongbok = members.filter((member) => hasRole(member, "공복"));
  if (members.length === 0) return <div className="val-card p-5 text-sm text-[#7b8a96]">경고 역할 보유자가 없습니다.</div>;

  return (
    <div className="val-card p-5">
      <div className="mb-4 text-xs uppercase tracking-widest text-[#7b8a96]">보유자 현황</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RoleGroup title="두끼" members={dukki} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
        <RoleGroup title="공복" members={gongbok} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function RoleGroup(props: {
  title: string;
  members: Member[];
  records: AdminRecord[];
  onAdd: (type: RecordType, member?: Member) => void;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-2 py-1 text-xs font-bold text-[#ff4655]">{props.title}</span>
        <span className="text-xs text-[#7b8a96]">{props.members.length}명</span>
      </div>
      <div className="space-y-2">
        {props.members.length === 0 ? (
          <div className="rounded border border-[#263442] bg-[#0f1923]/70 p-4 text-sm text-[#7b8a96]">대상자가 없습니다.</div>
        ) : (
          props.members.map((member) => (
            <MemberRecordCard
              key={member.discordId ?? member.name}
              member={member}
              records={props.records.filter((record) => record.user.discordId === member.discordId)}
              onAdd={props.onAdd}
              onEdit={props.onEdit}
              onDelete={props.onDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}

function MemberRecordCard({
  member,
  records,
  onAdd,
  onEdit,
  onDelete,
}: {
  member: Member;
  records: AdminRecord[];
  onAdd: (type: RecordType, member?: Member) => void;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  const warnings = records.filter((record) => record.type === "warning");
  const complaints = records.filter((record) => record.type === "complaint");

  return (
    <details className="rounded border border-[#263442] bg-[#0f1923]/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MemberAvatar member={member} size="h-7 w-7" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{member.name ?? "알 수 없음"}</div>
            <div className="text-xs text-[#7b8a96]">경고 {warnings.length} / 민원 {complaints.length}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={(event) => { event.preventDefault(); onAdd("warning", member); }} className="rounded bg-[#ff4655]/15 px-2 py-1 text-[11px] font-bold text-[#ff8b95]">+경고</button>
          <button type="button" onClick={(event) => { event.preventDefault(); onAdd("complaint", member); }} className="rounded bg-[#f59e0b]/15 px-2 py-1 text-[11px] font-bold text-[#f59e0b]">+민원</button>
        </div>
      </summary>
      <div className="border-t border-[#263442] p-3">
        <CompactRecords records={records} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </details>
  );
}

function CompactRecords({ records, onEdit, onDelete }: { records: AdminRecord[]; onEdit: (record: AdminRecord) => void; onDelete: (record: AdminRecord) => void }) {
  if (records.length === 0) return <div className="text-sm text-[#7b8a96]">등록된 경고/민원이 없습니다.</div>;
  return (
    <div className="space-y-2">
      {records.map((record) => (
        <RecordItem key={record.id} record={record} compact onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

function AdminRecordsList({
  records,
  title,
  onEdit,
  onDelete,
}: {
  records: AdminRecord[];
  title: string;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  if (records.length === 0) return <div className="val-card p-12 text-center text-[#7b8a96]">경고/민원 내역이 없습니다.</div>;
  return (
    <div className="val-card p-5">
      <div className="mb-4 text-xs uppercase tracking-widest text-[#7b8a96]">{title} ({records.length}건)</div>
      <div className="space-y-3">
        {records.map((record) => (
          <RecordItem key={record.id} record={record} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function RecordItem({
  record,
  compact,
  onEdit,
  onDelete,
}: {
  record: AdminRecord;
  compact?: boolean;
  onEdit: (record: AdminRecord) => void;
  onDelete: (record: AdminRecord) => void;
}) {
  return (
    <div className={`rounded border border-[#263442] bg-[#0a1520]/70 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-[11px] font-black ${recordColor(record.type)}`}>{recordLabel(record.type)}</span>
            {!compact && <span className="text-sm font-bold text-white">{record.user.name ?? "알 수 없음"}</span>}
            {!record.active && <span className="rounded bg-[#263442] px-2 py-0.5 text-[11px] text-[#8da0ad]">비활성</span>}
          </div>
          <div className="break-keep text-sm text-[#c8d3db]">{record.reason}</div>
          {record.note && <div className="mt-2 rounded bg-[#0f1923] px-3 py-2 text-xs text-[#9aa8b3]">{record.note}</div>}
          <div className="mt-2 text-[11px] text-[#7b8a96]">
            작성자 {record.issuedBy || "관리자"} / {new Date(record.createdAt).toLocaleDateString("ko-KR")}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => onEdit(record)} className="rounded border border-[#263442] px-2 py-1 text-[11px] text-[#c8d3db] hover:border-[#ff4655]/50">수정</button>
          <button type="button" onClick={() => onDelete(record)} className="rounded border border-[#ff4655]/40 px-2 py-1 text-[11px] text-[#ff8b95] hover:bg-[#ff4655]/10">삭제</button>
        </div>
      </div>
    </div>
  );
}

function NewbiesTab({
  members,
}: {
  members: Member[];
}) {
  const [graduatingId, setGraduatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [localMembers, setLocalMembers] = useState(members);

  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  async function graduateMember(member: Member) {
    if (!member.discordId || graduatingId) return;
    if (!confirm(`${member.name ?? "대상자"}님을 졸업 처리할까요?`)) return;

    setGraduatingId(member.discordId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/newbies/graduate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId: member.discordId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "졸업 처리에 실패했습니다.");

      setLocalMembers((prev) =>
        prev.map((item) =>
          item.discordId === member.discordId
            ? { ...item, roles: item.roles.filter((role) => normalizeRole(role) !== normalizeRole(data.removedRole ?? "")) }
            : item
        )
      );
      setMessage(data.message ?? "졸업 처리가 완료되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "졸업 처리 중 오류가 발생했습니다.");
    } finally {
      setGraduatingId(null);
    }
  }

  const visibleMembers = localMembers.filter((member) => newbieGroup(member));
  const newbies = visibleMembers.filter((member) => newbieGroup(member) === "newbie");
  const visibleProbation = visibleMembers.filter((member) => newbieGroup(member) === "probation");

  return (
    <>
      {message && <div className="mb-4 rounded border border-[#263442] bg-[#0f1923] px-4 py-3 text-sm text-[#c8d3db]">{message}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <NewbieGroup title="웰컴 수습" members={visibleProbation} onGraduate={graduateMember} graduatingId={graduatingId} />
        <NewbieGroup title="신입" members={newbies} onGraduate={graduateMember} graduatingId={graduatingId} />
      </div>
    </>
  );
}

function NewbieGroup({
  title,
  members,
  onGraduate,
  graduatingId,
}: {
  title: string;
  members: Member[];
  onGraduate: (member: Member) => void;
  graduatingId: string | null;
}) {
  return (
    <section className="val-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#7b8a96]">{title}</div>
          <div className="mt-1 text-sm text-[#c8d3db]">{members.length}명</div>
        </div>
      </div>
      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="rounded border border-[#263442] bg-[#0f1923]/70 p-4 text-sm text-[#7b8a96]">대상자가 없습니다.</div>
        ) : (
          members.map((member) => (
            <NewbieCard
              key={member.discordId ?? member.name}
              member={member}
              onGraduate={onGraduate}
              graduating={Boolean(member.discordId && graduatingId === member.discordId)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function NewbieCard({
  member,
  onGraduate,
  graduating,
}: {
  member: Member;
  onGraduate: (member: Member) => void;
  graduating: boolean;
}) {
  return (
    <details className="rounded border border-[#263442] bg-[#0f1923]/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MemberAvatar member={member} size="h-8 w-8" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{member.name ?? "알 수 없음"}</div>
            <div className="truncate text-xs text-[#7b8a96]">{member.roles.join(" / ")}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!member.discordId || graduating}
            onClick={(event) => {
              event.preventDefault();
              onGraduate(member);
            }}
            className="rounded bg-[#10b981]/15 px-2 py-1 text-[11px] font-bold text-[#6ee7b7] hover:bg-[#10b981]/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {graduating ? "처리 중" : "졸업"}
          </button>
          <span className="text-xs text-[#7b8a96]">메모 관리</span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-[#263442] p-3">
        <MemberNotes discordId={member.discordId} />
      </div>
    </details>
  );
}

function MemberNotes({ discordId }: { discordId: string | null }) {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [content, setContent] = useState("");
  const [issuedBy, setIssuedBy] = useState("관리자");
  const [editing, setEditing] = useState<AdminNote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!discordId) return;
    setLoading(true);
    fetch(`/api/admin/notes?discordId=${encodeURIComponent(discordId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setNotes(data.notes ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [discordId]);

  async function saveNote() {
    if (!discordId || !content.trim()) return;
    const isEdit = Boolean(editing);
    const response = await fetch(isEdit ? `/api/admin/notes/${editing!.id}` : "/api/admin/notes", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordId, content, issuedBy }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    if (isEdit) {
      setNotes((prev) => prev.map((note) => (note.id === editing!.id ? { ...note, content, issuedBy } : note)));
    } else {
      setNotes((prev) => [data.note, ...prev]);
    }
    setContent("");
    setIssuedBy("관리자");
    setEditing(null);
  }

  async function deleteNote(note: AdminNote) {
    if (!confirm("메모를 삭제할까요?")) return;
    const response = await fetch(`/api/admin/notes/${note.id}`, { method: "DELETE" });
    if (response.ok) setNotes((prev) => prev.filter((item) => item.id !== note.id));
  }

  return (
    <div className="rounded border border-[#263442] bg-[#07131e] p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#7b8a96]">메모</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input value={content} onChange={(event) => setContent(event.target.value)} placeholder="신입 관련 메모" className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white focus:border-[#ff4655]/60 focus:outline-none" />
        <input value={issuedBy} onChange={(event) => setIssuedBy(event.target.value)} placeholder="작성자" className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white focus:border-[#ff4655]/60 focus:outline-none" />
        <button type="button" onClick={saveNote} className="rounded bg-[#ff4655] px-3 py-2 text-sm font-bold text-white">{editing ? "수정" : "작성"}</button>
      </div>
      {loading ? (
        <div className="mt-3 text-xs text-[#7b8a96]">메모 로딩 중...</div>
      ) : (
        <div className="mt-3 space-y-2">
          {notes.length === 0 ? <div className="text-xs text-[#7b8a96]">작성된 메모가 없습니다.</div> : null}
          {notes.map((note) => (
            <div key={note.id} className="rounded border border-[#263442] bg-[#0f1923] p-2">
              <div className="text-sm text-[#c8d3db]">{note.content}</div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7b8a96]">
                <span>작성자 {note.issuedBy} / {new Date(note.createdAt).toLocaleDateString("ko-KR")}</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => { setEditing(note); setContent(note.content); setIssuedBy(note.issuedBy); }} className="text-[#c8d3db] hover:text-white">수정</button>
                  <button type="button" onClick={() => deleteNote(note)} className="text-[#ff8b95] hover:text-[#ff4655]">삭제</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <Summary label="기간 내 총 통화" value={`${Math.floor(totals.voiceSeconds / 3600)}시간 ${Math.floor((totals.voiceSeconds % 3600) / 60)}분`} />
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
                      <MemberAvatar member={record} />
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
