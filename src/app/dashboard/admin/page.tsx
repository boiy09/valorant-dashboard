"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

interface Warning {
  id: string;
  userId: string;
  reason: string;
  issuedBy: string;
  active: boolean;
  note: string | null;
  createdAt: string;
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

type AdminAction = "sync-members" | "restart-bot";
type AdminView = "server-records" | "warnings";

const WARNING_ROLES: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: "두끼", color: "#f59e0b", bg: "#f59e0b22", border: "#f59e0b50" },
  2: { label: "공복", color: "#ff4655", bg: "#ff465522", border: "#ff465550" },
};

function isRoleHolder(member: Member) {
  return member.roles.some((r) => {
    const n = r.replace(/\s/g, "").toLowerCase();
    return n.includes("두끼") || n.includes("공복");
  });
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [view, setView] = useState<AdminView>("server-records");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [records, setRecords] = useState<ServerRecord[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return toDateInputValue(d);
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [showAddWarning, setShowAddWarning] = useState(false);
  const [addWarningTarget, setAddWarningTarget] = useState<Member | null>(null);

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

  // 경고 탭에서 전체 멤버 로드
  useEffect(() => {
    if (view !== "warnings" || !isAdmin) return;
    fetch("/api/members", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAllMembers(d.members ?? []))
      .catch(() => setAllMembers([]));
  }, [view, isAdmin]);

  useRealtime("admin", () => {
    if (!isAdmin || view === "server-records") return;
    fetch("/api/warnings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setWarnings(d.warnings ?? []))
      .catch(() => {});
  });

  const roleMembers = useMemo(() => allMembers.filter(isRoleHolder), [allMembers]);

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
    setWarnings((prev) => prev.map((w) => (w.id === warningId ? { ...w, note } : w)));
  }

  async function handleAddWarning(discordId: string, reason: string, note: string) {
    const r = await fetch("/api/warnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordId, reason, note }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? "오류가 발생했습니다.");
    setWarnings((prev) => [data.warning, ...prev]);
  }

  function openAddWarning(member?: Member) {
    setAddWarningTarget(member ?? null);
    setShowAddWarning(true);
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

      {/* Bot Operations */}
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

      {/* View toggle */}
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

        {view === "server-records" ? (
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
        ) : (
          <button
            type="button"
            onClick={() => openAddWarning()}
            className="val-btn bg-[#ff4655] px-4 py-2 text-sm font-bold text-white"
          >
            + 경고 추가
          </button>
        )}
      </div>

      {loading ? (
        <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
      ) : view === "server-records" ? (
        <ServerRecordsTable records={records} totals={totals} />
      ) : (
        <WarningsList
          warnings={warnings}
          roleMembers={roleMembers}
          onNoteUpdate={handleNoteUpdate}
          onAddWarning={openAddWarning}
        />
      )}

      {showAddWarning && (
        <AddWarningModal
          members={allMembers}
          defaultMember={addWarningTarget}
          onSubmit={handleAddWarning}
          onClose={() => { setShowAddWarning(false); setAddWarningTarget(null); }}
        />
      )}
    </div>
  );
}

// ─── 경고 추가 모달 ────────────────────────────────────────────────────────────
function AddWarningModal({
  members,
  defaultMember,
  onSubmit,
  onClose,
}: {
  members: Member[];
  defaultMember: Member | null;
  onSubmit: (discordId: string, reason: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(defaultMember?.discordId ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(defaultMember?.name ?? "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          !search ||
          (m.name ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [members, search]
  );

  const selectedMember = members.find((m) => m.discordId === selectedId) ?? null;

  function selectMember(m: Member) {
    setSelectedId(m.discordId ?? "");
    setSearch(m.name ?? "");
    setDropdownOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) { setError("멤버를 선택해주세요."); return; }
    if (!reason.trim()) { setError("경고 사유를 입력해주세요."); return; }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(selectedId, reason, note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
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
            <h2 className="text-lg font-black text-white">경고 추가</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-[#7b8a96] hover:bg-[#1a242d] hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Member search */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">
              멤버
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center gap-2 rounded border border-[#263442] bg-[#0f1923] px-3 py-2 focus-within:border-[#ff4655]/60">
                {selectedMember?.image && (
                  <img src={selectedMember.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                )}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); setSelectedId(""); }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="멤버 이름 검색..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-[#4a5d6b] focus:outline-none"
                />
              </div>
              {dropdownOpen && filteredMembers.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded border border-[#263442] bg-[#111c24] shadow-xl">
                  {filteredMembers.slice(0, 50).map((m) => (
                    <button
                      key={m.discordId}
                      type="button"
                      onMouseDown={() => selectMember(m)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#c8d3db] hover:bg-[#1a242d] hover:text-white"
                    >
                      {m.image ? (
                        <img src={m.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2a3540] text-[9px] text-[#7b8a96]">
                          {m.name?.[0] ?? "?"}
                        </div>
                      )}
                      <span>{m.name ?? "알 수 없음"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">
              경고 사유
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="경고 사유를 입력하세요"
              className="w-full rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white placeholder-[#4a5d6b] focus:border-[#ff4655]/60 focus:outline-none"
            />
          </div>

          {/* Note/Memo */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#7b8a96]">
              메모 <span className="normal-case tracking-normal text-[#4a5d6b]">(선택)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={"언제, 어떤 상황에서 받았는지 메모...\n예) 2026-05-13 채팅 도배로 인한 경고"}
              rows={3}
              className="w-full resize-none rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-sm text-white placeholder-[#4a5d6b] focus:border-[#ff4655]/60 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded border border-[#ff4655]/30 bg-[#ff4655]/10 px-3 py-2 text-sm text-[#ff4655]">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded bg-[#ff4655] py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? "추가 중..." : "경고 추가"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-[#1a242d] px-5 py-2.5 text-sm text-[#7b8a96] hover:text-white"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 경고 규칙 배너 ────────────────────────────────────────────────────────────
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

// ─── 역할 보유자 카드 ──────────────────────────────────────────────────────────
function RoleHoldersCard({
  members,
  warnings,
  onAddWarning,
}: {
  members: Member[];
  warnings: Warning[];
  onAddWarning: (member: Member) => void;
}) {
  const dukkiMembers = members.filter((m) =>
    m.roles.some((r) => r.replace(/\s/g, "").toLowerCase().includes("두끼"))
  );
  const gongbokMembers = members.filter((m) =>
    m.roles.some((r) => r.replace(/\s/g, "").toLowerCase().includes("공복"))
  );

  if (members.length === 0) return null;

  function getActiveWarnings(member: Member) {
    return warnings.filter((w) => w.user.discordId === member.discordId && w.active);
  }

  function MemberRow({ member }: { member: Member }) {
    const activeWarnings = getActiveWarnings(member);
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-[#1e2d3a] bg-[#0f1923]/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {member.image ? (
            <img src={member.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2a3540] text-[9px] text-[#7b8a96]">
              {member.name?.[0] ?? "?"}
            </div>
          )}
          <span className="truncate text-sm text-[#ece8e1]">{member.name ?? "알 수 없음"}</span>
          {activeWarnings.length > 0 && (
            <span className="shrink-0 rounded bg-[#ff4655]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#ff4655]">
              경고 {activeWarnings.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAddWarning(member)}
          className="shrink-0 rounded border border-[#263442] bg-[#1a242d] px-2.5 py-1 text-[11px] font-bold text-[#7b8a96] transition-colors hover:border-[#ff4655]/50 hover:bg-[#ff4655]/10 hover:text-[#ff4655]"
        >
          + 경고
        </button>
      </div>
    );
  }

  return (
    <div className="val-card mb-4 p-4">
      <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">역할 보유자 현황</div>
      <div className="flex flex-col gap-4">
        {dukkiMembers.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="rounded border border-[#f59e0b]/40 bg-[#f59e0b]/15 px-2 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                두끼
              </span>
              <span className="text-xs text-[#7b8a96]">{dukkiMembers.length}명</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {dukkiMembers.map((m) => (
                <MemberRow key={m.discordId ?? m.name} member={m} />
              ))}
            </div>
          </div>
        )}
        {gongbokMembers.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="rounded border border-[#ff4655]/40 bg-[#ff4655]/15 px-2 py-0.5 text-[11px] font-bold text-[#ff4655]">
                공복
              </span>
              <span className="text-xs text-[#7b8a96]">{gongbokMembers.length}명</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {gongbokMembers.map((m) => (
                <MemberRow key={m.discordId ?? m.name} member={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메모 편집기 ───────────────────────────────────────────────────────────────
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
      <div className="mt-2 flex flex-col gap-1.5">
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
    <button
      type="button"
      onClick={startEdit}
      className="mt-2 flex w-full items-start gap-1.5 rounded border border-[#263442] bg-[#0f1923]/80 px-2.5 py-1.5 text-left transition-colors hover:border-[#ff4655]/40 hover:bg-[#ff4655]/5"
    >
      <span className="mt-0.5 shrink-0 text-[11px] text-[#7b8a96]">✎</span>
      {note ? (
        <span className="text-xs text-[#c8d3db]">{note}</span>
      ) : (
        <span className="text-xs italic text-[#7b8a96]">메모 추가...</span>
      )}
    </button>
  );
}

// ─── 경고 목록 ─────────────────────────────────────────────────────────────────
function WarningsList({
  warnings,
  roleMembers,
  onNoteUpdate,
  onAddWarning,
}: {
  warnings: Warning[];
  roleMembers: Member[];
  onNoteUpdate: (warningId: string, note: string | null) => void;
  onAddWarning: (member: Member) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { user: Warning["user"]; userId: string; warnings: Warning[] }>();
    for (const w of warnings) {
      if (!map.has(w.userId)) map.set(w.userId, { user: w.user, userId: w.userId, warnings: [] });
      map.get(w.userId)!.warnings.push(w);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.warnings.filter((w) => w.active).length - a.warnings.filter((w) => w.active).length
    );
  }, [warnings]);

  return (
    <div>
      <WarningRulesBanner />
      <RoleHoldersCard members={roleMembers} warnings={warnings} onAddWarning={onAddWarning} />

      {warnings.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">
          경고 내역이 없습니다.
          <div className="mt-1 text-xs">우측 상단 &quot;+ 경고 추가&quot; 또는 역할 보유자의 &quot;+ 경고&quot; 버튼으로 추가하세요.</div>
        </div>
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
                        활성 {activeCount}회 / 전체 {userWarnings.length}회
                      </span>
                      {roleInfo && (
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold"
                          style={{ color: roleInfo.color, borderColor: roleInfo.border, background: roleInfo.bg }}
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
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                                w.active ? "bg-[#ff4655]/20 text-[#ff4655]" : "bg-[#263442] text-[#7b8a96]"
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
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
