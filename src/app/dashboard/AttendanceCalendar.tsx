"use client";

import { useMemo, useState } from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export default function AttendanceCalendar({
  attendanceDates,
  activitySecondsByDate,
  minAttendanceSeconds,
}: {
  attendanceDates: string[];
  activitySecondsByDate: Record<string, number>;
  minAttendanceSeconds: number;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const todayKey = toDateKey(new Date());
  const dateSet = useMemo(() => new Set(attendanceDates), [attendanceDates]);
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthAttendanceCount = days.filter((day) => day.inMonth && dateSet.has(day.key)).length;
  const minAttendanceText = formatDuration(minAttendanceSeconds);

  function moveMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black text-white">{monthLabel(visibleMonth)}</div>
          <div className="text-xs text-[#7b8a96]">이번 달 출석 {monthAttendanceCount}일</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className="h-8 w-8 rounded border border-[#2a3540] text-[#7b8a96] transition-colors hover:border-[#ff4655] hover:text-white"
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="h-8 rounded border border-[#2a3540] px-3 text-xs font-bold text-[#7b8a96] transition-colors hover:border-[#ff4655] hover:text-white"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className="h-8 w-8 rounded border border-[#2a3540] text-[#7b8a96] transition-colors hover:border-[#ff4655] hover:text-white"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-3 border-l-2 border-[#ff4655] bg-[#ff4655]/10 px-3 py-2 text-xs font-semibold text-[#ece8e1]">
        출석은 하루 음성 채널 활동 시간이 최소 {minAttendanceText} 이상일 때만 인정됩니다.
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded border border-[#2a3540] bg-[#0f1923]">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-b border-[#2a3540] bg-[#111c24] py-2 text-center text-[11px] font-bold text-[#7b8a96]"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const attended = dateSet.has(day.key);
          const isToday = day.key === todayKey;
          const duration = formatDuration(activitySecondsByDate[day.key] ?? 0);

          return (
            <div
              key={day.key}
              title={`${day.key}${attended ? " 출석" : " 미출석"}${duration ? ` · ${duration}` : ""}`}
              className={`relative min-h-20 border-b border-r border-[#1f2a33] p-2 transition-colors ${
                day.inMonth ? "bg-[#0f1923]" : "bg-[#0b141c] text-[#3a4a56]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                    isToday
                      ? "bg-[#ff4655] text-white"
                      : day.inMonth
                        ? "text-[#ece8e1]"
                        : "text-[#3a4a56]"
                  }`}
                >
                  {day.day}
                </span>
                {attended && (
                  <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
                    출석
                  </span>
                )}
              </div>

              {duration && day.inMonth && (
                <div className="mt-3 rounded border border-[#2a3540] bg-[#111c24] px-2 py-1 text-center text-[11px] font-bold text-[#ece8e1]">
                  {duration}
                </div>
              )}

              {attended ? (
                <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-[#ff4655]" />
              ) : (
                day.inMonth && <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-[#1a242d]" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-[#7b8a96]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#ff4655]" />
          출석
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#1a242d]" />
          미출석
        </span>
        <span className="text-[#4a5a68]">날짜 칸의 시간은 해당일 음성 채널 접속 시간이며, {minAttendanceText} 미만은 미출석입니다.</span>
      </div>
    </div>
  );
}
