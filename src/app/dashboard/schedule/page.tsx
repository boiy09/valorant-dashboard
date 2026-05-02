"use client";

import { useState, useEffect } from "react";

interface ScrimEvent {
  id: string;
  title: string;
  scheduledAt: string;
  description: string | null;
  createdBy: string;
}

export default function SchedulePage() {
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedule")
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const upcoming = events.filter(e => new Date(e.scheduledAt) >= now);
  const past = events.filter(e => new Date(e.scheduledAt) < now);

  function EventCard({ e, isPast }: { e: ScrimEvent; isPast?: boolean }) {
    const dt = new Date(e.scheduledAt);
    return (
      <div className={`val-card p-5 ${isPast ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold mb-1">{e.title}</div>
            {e.description && <p className="text-[#7b8a96] text-sm mt-1">{e.description}</p>}
            <div className="text-[#7b8a96] text-xs mt-2">등록: {e.createdBy}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-white text-sm font-bold">
              {dt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            </div>
            <div className="text-[#ff4655] text-xs font-bold mt-0.5">
              {dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-[#7b8a96] text-xs mt-0.5">
              {dt.toLocaleDateString("ko-KR", { weekday: "short" })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">일정</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">내전, 연습, 토너먼트 일정 — Discord에서 <code className="bg-[#111c24] px-1 rounded">/일정 추가</code> 로 등록하세요</p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : events.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">등록된 일정이 없어요</div>
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.length > 0 && (
            <div>
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">예정된 일정 ({upcoming.length})</div>
              <div className="flex flex-col gap-2">
                {upcoming.map(e => <EventCard key={e.id} e={e} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">지난 일정</div>
              <div className="flex flex-col gap-2">
                {past.slice(0, 5).map(e => <EventCard key={e.id} e={e} isPast />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
