"use client";

import { useEffect, useState } from "react";

interface Status {
  status: string;
  db: { status: string; latency: number };
  stats: {
    users: number;
    scrims: number;
    announcements: number;
    todayAttendance: number;
  };
  uptime: number;
  timestamp: string;
}

function fmtUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}분`;
  return `${hours}시간 ${minutes}분`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-400" : "bg-[#ff4655]"}`} />;
}

export default function BotStatus({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/bot-status")
        .then((response) => {
          if (!response.ok) throw new Error("status request failed");
          return response.json();
        })
        .then((nextData) => {
          setData(nextData);
          setError(false);
        })
        .catch(() => setError(true));

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className={`${compact ? "px-3 py-3 text-xs" : "val-card p-5 text-sm"} text-[#ff4655]`}>
        봇 상태를 불러오지 못했습니다.
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${compact ? "px-3 py-3 text-xs" : "val-card p-5 text-sm"} animate-pulse text-[#7b8a96]`}>
        상태 확인 중...
      </div>
    );
  }

  const botOk = data.status === "정상";
  const dbOk = data.db.status === "정상";
  const allOk = botOk && dbOk;
  const checkedAt = new Date(data.timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (compact) {
    return (
      <div className="border-t border-[#2a3540] px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7b8a96]">봇 모니터링</span>
          <span className={`flex items-center gap-1 text-[10px] font-bold ${allOk ? "text-green-400" : "text-[#ff4655]"}`}>
            <StatusDot ok={allOk} />
            {allOk ? "정상" : "점검 필요"}
          </span>
        </div>

        <div className="grid gap-1.5 text-[11px]">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <span className="flex items-center gap-1.5 text-[#7b8a96]">
              <StatusDot ok={botOk} />
              봇
            </span>
            <span className="font-bold text-white">{data.status}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <span className="flex items-center gap-1.5 text-[#7b8a96]">
              <StatusDot ok={dbOk} />
              DB
            </span>
            <span className="font-bold tabular-nums text-white">{data.db.latency}ms</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[#263442] pt-1.5">
            <span className="text-[#7b8a96]">오늘 출석</span>
            <span className="font-bold tabular-nums text-white">{data.stats.todayAttendance}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <span className="text-[#7b8a96]">업타임</span>
            <span className="font-bold tabular-nums text-white">{fmtUptime(data.uptime)}</span>
          </div>
        </div>

        <div className="mt-2 text-[10px] text-[#566777]">최근 확인 {checkedAt}</div>
      </div>
    );
  }

  return (
    <div className="val-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-[#7b8a96]">봇 상태 모니터링</div>
        <div className="flex items-center gap-1.5">
          <StatusDot ok={allOk} />
          <span className={`text-xs font-bold ${allOk ? "text-green-400" : "text-[#ff4655]"}`}>
            {allOk ? "정상 운영 중" : "오류 감지"}
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <StatusDot ok={botOk} />
          <span className="text-[#7b8a96]">봇 서비스</span>
          <span className="ml-auto text-white">{data.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot ok={dbOk} />
          <span className="text-[#7b8a96]">데이터베이스</span>
          <span className="ml-auto text-white">{data.db.latency}ms</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[#2a3540] pt-4 text-sm">
        {[
          { label: "총 유저", value: data.stats.users },
          { label: "오늘 출석", value: data.stats.todayAttendance },
          { label: "내전 수", value: data.stats.scrims },
          { label: "공지 수", value: data.stats.announcements },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-[#7b8a96]">{stat.label}</span>
            <span className="font-bold text-white">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-[#2a3540] pt-3 text-xs text-[#7b8a96]">
        업타임 {fmtUptime(data.uptime)} · 최근 확인 {checkedAt}
      </div>
    </div>
  );
}
