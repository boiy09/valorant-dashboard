"use client";

import { useEffect, useState } from "react";

interface Warning {
  id: string;
  reason: string;
  issuedBy: string;
  active: boolean;
  createdAt: string;
  user: { name: string | null; image: string | null };
}

interface Application {
  id: string;
  status: string;
  createdAt: string;
  user: { name: string | null; image: string | null };
  answers: string;
}

type AdminAction = "sync-members" | "restart-bot";

export default function AdminPage() {
  const [view, setView] = useState<"warnings" | "applications">("warnings");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");

  useEffect(() => {
    fetch("/api/me/roles")
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.isAdmin ?? false))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (view === "warnings") {
      fetch("/api/warnings")
        .then((response) => response.json())
        .then((data) => setWarnings(data.warnings ?? []))
        .finally(() => setLoading(false));
    } else {
      fetch("/api/applications")
        .then((response) => response.json())
        .then((data) => setApplications(data.applications ?? []))
        .finally(() => setLoading(false));
    }
  }, [view]);

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
      setActionMessage(data.message ?? data.error ?? "작업을 완료했습니다.");
    } catch {
      setActionMessage("작업 요청 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  const statusLabel: Record<string, string> = { pending: "심사 중", approved: "승인", rejected: "거절" };
  const statusColor: Record<string, string> = {
    pending: "text-yellow-400 bg-yellow-400/10",
    approved: "text-green-400 bg-green-400/10",
    rejected: "text-[#ff4655] bg-[#ff4655]/10",
  };

  if (isAdmin === null) {
    return <div className="val-card p-12 text-center text-[#7b8a96]">권한 확인 중...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="val-card p-12 text-center">
        <div className="mb-2 text-lg font-bold text-white">접근 권한 없음</div>
        <div className="text-sm text-[#7b8a96]">관리자 또는 운영진 역할이 있어야 접근할 수 있습니다.</div>
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
        <p className="mt-0.5 text-sm text-[#7b8a96]">경고 내역, 멤버 심사, 봇 운영 작업을 관리합니다.</p>
      </div>

      <div className="val-card mb-6 p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Bot Operations</div>
            <div className="mt-1 text-sm text-[#c8d3db]">
              Discord 멤버/역할 정보를 즉시 갱신하거나 봇 재시작 요청을 보냅니다.
            </div>
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

      <div className="mb-6 flex gap-2">
        {([
          ["warnings", "경고 내역"],
          ["applications", "멤버 심사"],
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

      {loading ? (
        <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
      ) : view === "warnings" ? (
        warnings.length === 0 ? (
          <div className="val-card p-12 text-center text-[#7b8a96]">경고 내역이 없습니다.</div>
        ) : (
          <div className="val-card p-5">
            <div className="mb-4 text-xs uppercase tracking-widest text-[#7b8a96]">경고 내역 ({warnings.length})</div>
            <div className="flex flex-col">
              {warnings.map((warning, index) => (
                <div
                  key={warning.id}
                  className={`flex items-center gap-4 py-3 ${
                    index < warnings.length - 1 ? "border-b border-[#2a3540]" : ""
                  }`}
                >
                  <div className="flex w-40 flex-shrink-0 items-center gap-2.5">
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
        )
      ) : applications.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">심사 내역이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((application) => {
            let answers: Record<string, string> = {};
            try {
              answers = JSON.parse(application.answers);
            } catch {}

            return (
              <div key={application.id} className="val-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {application.user.image ? (
                      <img src={application.user.image} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3540] text-sm text-[#7b8a96]">
                        {application.user.name?.[0]}
                      </div>
                    )}
                    <span className="font-bold text-white">{application.user.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${statusColor[application.status] ?? "bg-[#1a242d] text-[#7b8a96]"}`}>
                      {statusLabel[application.status] ?? application.status}
                    </span>
                    <span className="text-xs text-[#7b8a96]">
                      {new Date(application.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </div>
                {Object.keys(answers).length > 0 && (
                  <div className="flex flex-col gap-2">
                    {Object.entries(answers).map(([question, answer]) => (
                      <div key={question} className="rounded-lg bg-[#111c24] p-3">
                        <div className="mb-1 text-xs text-[#7b8a96]">{question}</div>
                        <div className="text-sm text-white">{answer}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
