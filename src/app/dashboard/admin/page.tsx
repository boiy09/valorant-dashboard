"use client";

import { useEffect, useMemo, useState } from "react";

interface Warning {
  id: string;
  reason: string;
  issuedBy: string;
  active: boolean;
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

type AdminAction = "sync-members" | "restart-bot";
type AdminView = "server-records" | "warnings";

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
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    fetch("/api/me/roles")
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.isAdmin ?? false))
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
      .then((response) => response.json())
      .then((data) => {
        if (view === "server-records") {
          setRecords(data.records ?? []);
        } else {
          setWarnings(data.warnings ?? []);
        }
      })
      .catch(() => {
        if (view === "server-records") setRecords([]);
        else setWarnings([]);
      })
      .finally(() => setLoading(false));
  }, [view, startDate, endDate, isAdmin]);

  const totals = useMemo(
    () => ({
      voiceSeconds: records.reduce((sum, item) => sum + item.voiceSeconds, 0),
      attendanceDays: records.reduce((sum, item) => sum + item.attendanceDays, 0),
      rejoinCount: records.reduce((sum, item) => sum + item.rejoinCount, 0),
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
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">관리</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">서버 기록, 경고 내역, 봇 운영 작업을 관리합니다.</p>
      </div>

      <div className="val-card mb-6 p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Bot Operations</div>
          <div className="mt-1 text-sm text-[#c8d3db]">
            Discord 멤버/역할 정보를 갱신하거나 봇을 재시작합니다.
          </div>
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

      <ScrimChannelManager />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([
            ["server-records", "서버 기록"],
            ["warnings", "경고 내역"],
          ] as const).map(([value, label]) => (
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
              onChange={(event) => setStartDate(event.target.value)}
              className="rounded border border-[#263442] bg-[#0f1923] px-3 py-2 text-white"
            />
            <span>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
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
        <WarningsList warnings={warnings} />
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

function WarningsList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return <div className="val-card p-12 text-center text-[#7b8a96]">경고 내역이 없습니다.</div>;
  }

  return (
    <div className="val-card p-5">
      <div className="mb-4 text-xs uppercase tracking-widest text-[#7b8a96]">경고 내역 ({warnings.length})</div>
      <div className="flex flex-col">
        {warnings.map((warning, index) => (
          <div
            key={warning.id}
            className={`flex items-center gap-4 py-3 ${index < warnings.length - 1 ? "border-b border-[#2a3540]" : ""}`}
          >
            <div className="flex w-44 flex-shrink-0 items-center gap-2.5">
              {warning.user.image ? (
                <img src={warning.user.image} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#7b8a96]">
                  {warning.user.name?.[0]}
                </div>
              )}
              <span className="truncate text-sm text-white">{warning.user.name}</span>
            </div>
            <div className="flex-1 text-sm text-[#c8d3db]">{warning.reason}</div>
            <div className="flex-shrink-0 text-right">
              <div className="text-xs text-[#7b8a96]">by {warning.issuedBy}</div>
              <div className="mt-0.5 text-xs text-[#7b8a96]">
                {new Date(warning.createdAt).toLocaleDateString("ko-KR")}
              </div>
              {!warning.active && <div className="mt-0.5 text-xs text-green-400">해제됨</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 내전 허용 채널 관리 컴포넌트 ───────────────────────────────────────────────
interface AllowedChannel {
  id: string;
  name: string | null;
}

function ScrimChannelManager() {
  const [channels, setChannels] = useState<AllowedChannel[]>([]);
  const [newChannelId, setNewChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/scrim-channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels ?? []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function addChannel() {
    const id = newChannelId.trim();
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/scrim-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: id }),
      });
      const data = await res.json();
      if (!res.ok) { showMessage("error", data.error ?? "추가 실패"); return; }
      setChannels((prev) => [...prev, data.channel]);
      setNewChannelId("");
      showMessage("success", `채널 ID ${id} 추가 완료`);
    } catch {
      showMessage("error", "네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function removeChannel(channelId: string) {
    setRemoving(channelId);
    try {
      const res = await fetch("/api/admin/scrim-channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (!res.ok) { showMessage("error", data.error ?? "삭제 실패"); return; }
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      showMessage("success", "채널 제거 완료");
    } catch {
      showMessage("error", "네트워크 오류");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="val-card mb-6 p-5">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-widest text-[#7b8a96]">내전 모집 허용 채널</div>
        <div className="mt-1 text-sm text-[#c8d3db]">
          아래에 등록된 채널 ID에서는 채널 이름 제한 없이 내전 모집 글을 올릴 수 있습니다.
        </div>
        <div className="mt-1 text-xs text-[#7b8a96]">
          채널 ID는 Discord에서 채널 우클릭 → &quot;ID 복사&quot;로 확인할 수 있습니다.
        </div>
      </div>

      {message && (
        <div className={`mb-3 rounded px-3 py-2 text-sm font-bold ${message.type === "success" ? "bg-[#00e7c2]/10 text-[#00e7c2]" : "bg-[#ff4655]/10 text-[#ff4655]"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center text-xs text-[#7b8a96]">불러오는 중...</div>
      ) : (
        <div className="mb-4 space-y-2">
          {channels.length === 0 ? (
            <div className="rounded border border-dashed border-[#2a3540] py-4 text-center text-xs text-[#7b8a96]">
              등록된 허용 채널이 없습니다. 아래에서 채널 ID를 추가하세요.
            </div>
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3 rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {ch.name ? `#${ch.name}` : "채널 이름 불명"}
                    </span>
                    {ch.name && (
                      <span className="rounded bg-[#1d2732] px-2 py-0.5 font-mono text-[11px] text-[#7b8a96]">{ch.id}</span>
                    )}
                  </div>
                  {!ch.name && (
                    <div className="font-mono text-xs text-[#7b8a96]">{ch.id}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeChannel(ch.id)}
                  disabled={removing === ch.id}
                  className="flex-shrink-0 rounded px-3 py-1.5 text-xs font-bold text-[#7b8a96] hover:bg-[#ff4655]/20 hover:text-[#ff4655] disabled:opacity-50"
                >
                  {removing === ch.id ? "삭제 중..." : "제거"}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newChannelId}
          onChange={(e) => setNewChannelId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addChannel()}
          placeholder="Discord 채널 ID (예: 1234567890123456789)"
          className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-[#7b8a96] focus:border-[#ff4655]"
        />
        <button
          type="button"
          onClick={addChannel}
          disabled={saving || !newChannelId.trim()}
          className="rounded bg-[#ff4655] px-4 py-2 text-sm font-black text-white hover:bg-[#e03040] disabled:opacity-50"
        >
          {saving ? "추가 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}
