"use client";

import { useState, useEffect } from "react";

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

export default function AdminPage() {
  const [view, setView] = useState<"warnings" | "applications">("warnings");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me/roles")
      .then(r => r.json())
      .then(d => setIsAdmin(d.isAdmin ?? false))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (view === "warnings") {
      fetch("/api/warnings")
        .then(r => r.json())
        .then(d => setWarnings(d.warnings ?? []))
        .finally(() => setLoading(false));
    } else {
      fetch("/api/applications")
        .then(r => r.json())
        .then(d => setApplications(d.applications ?? []))
        .finally(() => setLoading(false));
    }
  }, [view]);

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
        <div className="text-[#ff4655] text-4xl mb-4">🛡️</div>
        <div className="text-white font-bold text-lg mb-2">접근 권한 없음</div>
        <div className="text-[#7b8a96] text-sm">디스코드에서 <span className="text-white">관리자</span> 또는 <span className="text-white">어시스트</span> 역할이 있어야 이 페이지에 접근할 수 있어요.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">관리</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">경고 내역 및 멤버 심사 관리</p>
      </div>

      <div className="flex gap-2 mb-6">
        {([["warnings", "경고 내역"], ["applications", "멤버 심사"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`val-btn px-5 py-2 text-sm font-medium ${view === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="val-card p-8 text-center text-[#7b8a96]">로딩 중...</div>
      ) : view === "warnings" ? (
        warnings.length === 0 ? (
          <div className="val-card p-12 text-center text-[#7b8a96]">경고 내역이 없어요</div>
        ) : (
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-4">경고 내역 ({warnings.length})</div>
            <div className="flex flex-col gap-0">
              {warnings.map((w, i) => (
                <div key={w.id} className={`flex items-center gap-4 py-3 ${i < warnings.length - 1 ? "border-b border-[#2a3540]" : ""}`}>
                  <div className="flex items-center gap-2.5 w-40 flex-shrink-0">
                    {w.user.image
                      ? <img src={w.user.image} alt="" className="w-7 h-7 rounded-full" />
                      : <div className="w-7 h-7 rounded-full bg-[#2a3540] flex items-center justify-center text-xs text-[#7b8a96]">{w.user.name?.[0]}</div>
                    }
                    <span className="text-white text-sm truncate">{w.user.name}</span>
                  </div>
                  <div className="flex-1 text-[#c8d3db] text-sm">{w.reason}</div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[#7b8a96] text-xs">by {w.issuedBy}</div>
                    <div className="text-[#7b8a96] text-xs mt-0.5">{new Date(w.createdAt).toLocaleDateString("ko-KR")}</div>
                    {!w.active && <div className="text-green-400 text-xs mt-0.5">해제됨</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        applications.length === 0 ? (
          <div className="val-card p-12 text-center text-[#7b8a96]">심사 내역이 없어요</div>
        ) : (
          <div className="flex flex-col gap-3">
            {applications.map(app => {
              let answers: Record<string, string> = {};
              try { answers = JSON.parse(app.answers); } catch {}
              return (
                <div key={app.id} className="val-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      {app.user.image
                        ? <img src={app.user.image} alt="" className="w-8 h-8 rounded-full" />
                        : <div className="w-8 h-8 rounded-full bg-[#2a3540] flex items-center justify-center text-sm text-[#7b8a96]">{app.user.name?.[0]}</div>
                      }
                      <span className="text-white font-bold">{app.user.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor[app.status] ?? "text-[#7b8a96] bg-[#1a242d]"}`}>
                        {statusLabel[app.status] ?? app.status}
                      </span>
                      <span className="text-[#7b8a96] text-xs">{new Date(app.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                  </div>
                  {Object.keys(answers).length > 0 && (
                    <div className="flex flex-col gap-2">
                      {Object.entries(answers).map(([q, a]) => (
                        <div key={q} className="bg-[#111c24] rounded-lg p-3">
                          <div className="text-[#7b8a96] text-xs mb-1">{q}</div>
                          <div className="text-white text-sm">{a}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
