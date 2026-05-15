"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

interface VctMatch {
  leagueName: string;
  leagueCode: string;
  tournamentName: string;
  state: string;
  startsAt: string;
  teamOne: string;
  teamTwo: string;
  score: string;
  vodUrl?: string | null;
}

type CalendarType = "schedule" | "scrim" | "auction";

interface CalendarItem {
  id: string;
  type: CalendarType;
  title: string;
  description: string | null;
  date: string;
  status: string;
  createdBy: string;
  participantCount: number | null;
  href: string | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TYPE_LABEL: Record<CalendarType, string> = {
  schedule: "일정",
  scrim: "내전",
  auction: "경매",
};
const STATUS_LABEL: Record<string, string> = {
  waiting: "모집",
  active: "진행",
  completed: "완료",
  cancelled: "취소",
  scheduled: "예정",
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMonthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function gridRange(cursor: Date) {
  const days = buildMonthDays(cursor);
  return {
    start: startOfDay(days[0]),
    end: endOfDay(days[days.length - 1]),
  };
}

function typeClass(type: CalendarType) {
  if (type === "schedule") return "border-[#ff4655]/45 bg-[#ff4655]/12 text-[#ff8b95]";
  if (type === "auction") return "border-[#f59e0b]/45 bg-[#f59e0b]/12 text-[#fbbf24]";
  return "border-[#00e787]/35 bg-[#00e787]/10 text-[#6ee7b7]";
}

function statusText(status: string) {
  return STATUS_LABEL[status] ?? status;
}

export default function SchedulePage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<CalendarType, boolean>>({
    schedule: true,
    scrim: true,
    auction: true,
  });
  const [vctMatches, setVctMatches] = useState<VctMatch[]>([]);
  const [vctLoading, setVctLoading] = useState(true);

  const range = useMemo(() => gridRange(cursor), [cursor]);

  const fetchSchedule = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/calendar?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`, { cache: "no-store" })
        .then((response) => response.json()),
      fetch("/api/me/roles").then((response) => response.json()).catch(() => ({ isAdmin: false })),
    ])
      .then(([calendarData, roleData]) => {
        setItems(calendarData.items ?? []);
        setIsAdmin(Boolean(roleData.isAdmin));
      })
      .finally(() => setLoading(false));
  }, [range.start, range.end]);

  const visibleItems = useMemo(
    () => items.filter((item) => filters[item.type]),
    [items, filters]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visibleItems) {
      const key = dayKey(new Date(item.date));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [visibleItems]);
  const selectedItems = byDay.get(dayKey(selectedDate)) ?? [];
  const days = useMemo(() => buildMonthDays(cursor), [cursor]);
  const groupedVctMatches = useMemo(() => {
    const map = new Map<string, VctMatch[]>();
    for (const match of vctMatches) {
      const key = match.leagueName || match.leagueCode || "VCT";
      map.set(key, [...(map.get(key) ?? []), match]);
    }
    return Array.from(map.entries()).map(([leagueName, matches]) => ({ leagueName, matches }));
  }, [vctMatches]);

  function moveMonth(amount: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function goToday() {
    const today = new Date();
    setCursor(today);
    setSelectedDate(startOfDay(today));
  }

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  useRealtime("schedule", () => fetchSchedule());

  useEffect(() => {
    fetch("/api/valorant/vct", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setVctMatches(d.matches ?? []))
      .catch(() => {})
      .finally(() => setVctLoading(false));
  }, []);

  async function deleteEvent(id: string) {
    if (!isAdmin || deletingId) return;
    if (!window.confirm("일정을 삭제할까요?")) return;

    setDeletingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "일정 삭제에 실패했습니다.");

      setItems((current) => current.filter((item) => item.id !== id || item.type !== "schedule"));
      setMessage("일정을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일정 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">일정</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">일정, 일반 내전, 경매 내전 기록을 날짜 기준으로 확인합니다.</p>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} className="val-btn bg-[#1a242d] px-3 py-2 text-sm font-black text-[#c8d3db] hover:text-white">이전</button>
          <button type="button" onClick={goToday} className="val-btn bg-[#ff4655] px-4 py-2 text-sm font-black text-white">오늘</button>
          <button type="button" onClick={() => moveMonth(1)} className="val-btn bg-[#1a242d] px-3 py-2 text-sm font-black text-[#c8d3db] hover:text-white">다음</button>
          <div className="ml-2 text-xl font-black text-white">{monthTitle(cursor)}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABEL) as CalendarType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, [type]: !current[type] }))}
              className={`rounded border px-3 py-2 text-xs font-black transition-colors ${
                filters[type] ? typeClass(type) : "border-[#263442] bg-[#0f1923] text-[#6f8190]"
              }`}
            >
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </div>

      {!vctLoading && vctMatches.length > 0 && (
        <div className="mb-6 overflow-hidden rounded border border-[#2a3540] bg-[#111c24]">
          <div className="flex items-center justify-between border-b border-[#2a3540] px-4 py-3">
            <div className="text-xs font-black uppercase tracking-widest text-[#ff4655]">VCT 대회 일정</div>
            <div className="text-xs text-[#7b8a96]">{vctMatches.length}경기</div>
          </div>
          <div className="divide-y divide-[#1a2830]">
            {groupedVctMatches.map((group) => (
              <section key={group.leagueName}>
                <div className="flex items-center justify-between bg-[#0b141c] px-4 py-2">
                  <div className="text-xs font-black text-white">{group.leagueName}</div>
                  <div className="text-[10px] font-bold text-[#7b8a96]">{group.matches.length}경기</div>
                </div>
                <div className="divide-y divide-[#1a2830]">
                  {group.matches.slice(0, 6).map((match, i) => (
                    <VctMatchRow key={`${group.leagueName}-${match.startsAt}-${i}`} match={match} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="val-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#263442] bg-[#111c24]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-2 py-3 text-center text-xs font-black text-[#8da0ad]">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((date) => {
              const key = dayKey(date);
              const dayItems = byDay.get(key) ?? [];
              const muted = date.getMonth() !== cursor.getMonth();
              const active = sameDay(date, selectedDate);
              const today = sameDay(date, new Date());

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(startOfDay(date))}
                  className={`min-h-[118px] border-b border-r border-[#263442]/70 p-2 text-left transition-colors hover:bg-[#15212b] ${
                    active ? "bg-[#1a242d]" : "bg-[#08131d]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-black ${
                      today ? "bg-[#ff4655] text-white" : muted ? "text-[#4d5d69]" : "text-[#c8d3db]"
                    }`}>
                      {date.getDate()}
                    </span>
                    {dayItems.length > 0 && <span className="text-[10px] font-black text-[#7b8a96]">{dayItems.length}</span>}
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <div key={`${item.type}-${item.id}`} className={`truncate rounded border px-2 py-1 text-[11px] font-bold ${typeClass(item.type)}`}>
                        {item.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && <div className="px-1 text-[11px] text-[#7b8a96]">+{dayItems.length - 3}개</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="val-card p-5">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-widest text-[#ff4655]">Selected Day</div>
            <div className="mt-1 text-lg font-black text-white">
              {selectedDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
            </div>
          </div>

          {loading ? (
            <div className="rounded border border-[#263442] bg-[#0f1923]/70 p-4 text-sm text-[#7b8a96]">불러오는 중...</div>
          ) : selectedItems.length === 0 ? (
            <div className="rounded border border-[#263442] bg-[#0f1923]/70 p-4 text-sm text-[#7b8a96]">선택한 날짜의 일정이나 내전 기록이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {selectedItems.map((item) => (
                <CalendarDetailCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isAdmin={isAdmin}
                  deleting={deletingId === item.id}
                  onDelete={deleteEvent}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function VctMatchRow({ match }: { match: VctMatch }) {
  const date = new Date(match.startsAt);
  const isLive = match.state === "inProgress";
  const isDone = match.state === "completed";
  const isUpcoming = !isLive && !isDone;

  const dateStr = date.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  const timeStr = date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="w-28 flex-shrink-0">
        <div className="text-[10px] font-black text-[#7b8a96]">{match.leagueName}</div>
        <div className="text-[10px] text-[#4a5a68]">{match.tournamentName}</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-xs font-bold text-white">{match.teamOne}</span>
        {match.score ? (
          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${isLive ? "bg-[#ff4655]/20 text-[#ff4655]" : "bg-[#1a2830] text-[#7b8a96]"}`}>
            {match.score}
          </span>
        ) : (
          <span className="flex-shrink-0 text-[10px] text-[#4a5a68]">vs</span>
        )}
        <span className="truncate text-xs font-bold text-white">{match.teamTwo}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="whitespace-nowrap text-[10px] text-[#9aa8b3]">{dateStr} {timeStr}</span>
        {isLive && <span className="rounded bg-[#ff4655] px-1.5 py-0.5 text-[10px] font-black text-white">LIVE</span>}
        {isDone && match.vodUrl && (
          <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" className="rounded border border-[#2a3540] px-1.5 py-0.5 text-[10px] text-[#7b8a96] hover:text-white">VOD</a>
        )}
        {isUpcoming && <span className="rounded border border-[#2a3540] px-1.5 py-0.5 text-[10px] font-black text-[#7fffe6]">예정</span>}
        {isDone && !match.vodUrl && <span className="text-[10px] text-[#4a5a68]">종료</span>}
      </div>
    </div>
  );
}

function CalendarDetailCard({
  item,
  isAdmin,
  deleting,
  onDelete,
}: {
  item: CalendarItem;
  isAdmin: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const date = new Date(item.date);
  const content = (
    <article className="rounded border border-[#263442] bg-[#0f1923]/80 p-4 transition-colors hover:border-[#3a4a58]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-black ${typeClass(item.type)}`}>
          {TYPE_LABEL[item.type]}
        </span>
        <span className="text-xs font-black text-[#ff4655]">
          {date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="text-sm font-black text-white">{item.title}</div>
      {item.description && <p className="mt-2 whitespace-pre-wrap text-sm text-[#9aa8b3]">{item.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#7b8a96]">
        <span>{statusText(item.status)}</span>
        {item.participantCount !== null && <span>참가 {item.participantCount}명</span>}
      </div>
      {isAdmin && item.type === "schedule" && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onDelete(item.id);
          }}
          disabled={deleting}
          className="mt-3 rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-1 text-xs font-black text-[#ff8a95] transition-colors hover:border-[#ff4655] hover:text-white disabled:opacity-50"
        >
          {deleting ? "삭제 중..." : "삭제"}
        </button>
      )}
    </article>
  );

  if (!item.href) return content;
  return <Link href={item.href}>{content}</Link>;
}
