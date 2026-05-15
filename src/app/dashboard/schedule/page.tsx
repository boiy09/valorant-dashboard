"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSchedule = useCallback(() => {
    Promise.all([
      fetch("/api/schedule").then((response) => response.json()),
      fetch("/api/me/roles").then((response) => response.json()).catch(() => ({ isAdmin: false })),
    ])
      .then(([scheduleData, roleData]) => {
        setEvents(scheduleData.events ?? []);
        setIsAdmin(Boolean(roleData.isAdmin));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  useRealtime("schedule", () => fetchSchedule());

  const now = new Date();
  const upcoming = events.filter((event) => new Date(event.scheduledAt) >= now);
  const past = events.filter((event) => new Date(event.scheduledAt) < now);

  async function deleteEvent(id: string) {
    if (!isAdmin || deletingId) return;
    const confirmed = window.confirm("이 일정을 삭제할까요?");
    if (!confirmed) return;

    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "일정 삭제에 실패했습니다.");

      setEvents((current) => current.filter((event) => event.id !== id));
      setMessage("일정을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일정 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">일정</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">
          내전, 연습, 이벤트 일정을 확인합니다. 일정 등록은 Discord 명령어로 진행합니다.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">등록된 일정이 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.length > 0 && (
            <section>
              <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">
                예정된 일정 ({upcoming.length})
              </div>
              <div className="flex flex-col gap-2">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isAdmin={isAdmin}
                    deleting={deletingId === event.id}
                    onDelete={deleteEvent}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">지난 일정</div>
              <div className="flex flex-col gap-2">
                {past.slice(0, 10).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isPast
                    isAdmin={isAdmin}
                    deleting={deletingId === event.id}
                    onDelete={deleteEvent}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  isPast,
  isAdmin,
  deleting,
  onDelete,
}: {
  event: ScrimEvent;
  isPast?: boolean;
  isAdmin: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const scheduledAt = new Date(event.scheduledAt);

  return (
    <article className={`val-card p-5 ${isPast ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-base font-black text-white">{event.title}</div>
          {event.description && <p className="mt-1 whitespace-pre-wrap text-sm text-[#9aa8b3]">{event.description}</p>}
          <div className="mt-2 text-xs text-[#7b8a96]">등록자: {event.createdBy}</div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-3">
          <div className="text-right">
            <div className="text-sm font-black text-white">
              {scheduledAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            </div>
            <div className="mt-0.5 text-xs font-black text-[#ff4655]">
              {scheduledAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-0.5 text-xs text-[#7b8a96]">
              {scheduledAt.toLocaleDateString("ko-KR", { weekday: "short" })}
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete(event.id)}
              disabled={deleting}
              className="rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-1 text-xs font-black text-[#ff8a95] transition-colors hover:border-[#ff4655] hover:text-white disabled:opacity-50"
            >
              {deleting ? "삭제 중" : "삭제"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
