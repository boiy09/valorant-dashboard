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
  return `${hours}시간 ${minutes}분`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-[#ff4655]"}`} />;
}

export default function BotStatus() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/bot-status")
        .then((response) => response.json())
        .then(setData)
        .catch(() => setError(true));

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <div className="val-card p-5 text-[#ff4655] text-sm">봇 상태를 불러오지 못했어요.</div>;
  }

  if (!data) {
    return <div className="val-card p-5 text-[#7b8a96] text-sm animate-pulse">상태 확인 중...</div>;
  }

  const allOk = data.status === "정상" && data.db.status === "정상";

  return (
    <div className="val-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase">봇 상태 모니터링</div>
        <div className="flex items-center gap-1.5">
          <StatusDot ok={allOk} />
          <span className={`text-xs font-bold ${allOk ? "text-green-400" : "text-[#ff4655]"}`}>
            {allOk ? "정상 운영 중" : "오류 감지"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <StatusDot ok={data.status === "정상"} />
          <span className="text-[#7b8a96]">봇 서비스</span>
          <span className="text-white ml-auto">{data.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot ok={data.db.status === "정상"} />
          <span className="text-[#7b8a96]">데이터베이스</span>
          <span className="text-white ml-auto">{data.db.latency}ms</span>
        </div>
      </div>

      <div className="border-t border-[#2a3540] pt-4 grid grid-cols-2 gap-2 text-sm">
        {[
          { label: "총 유저", value: data.stats.users },
          { label: "오늘 출석", value: data.stats.todayAttendance },
          { label: "내전 수", value: data.stats.scrims },
          { label: "공지 수", value: data.stats.announcements },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-[#7b8a96]">{stat.label}</span>
            <span className="text-white font-bold">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-[#2a3540] text-xs text-[#7b8a96]">
        업타임 {fmtUptime(data.uptime)} · 최근 확인 {new Date(data.timestamp).toLocaleTimeString("ko-KR")}
      </div>
    </div>
  );
}
