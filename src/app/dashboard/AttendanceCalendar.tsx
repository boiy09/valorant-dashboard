"use client";

export default function AttendanceCalendar({ attendanceDates }: { attendanceDates: string[] }) {
  const dateSet = new Set(attendanceDates);

  // 오늘 기준 28일 (4주)
  const days: Array<{ date: string; attended: boolean; isToday: boolean }> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      attended: dateSet.has(dateStr),
      isToday: dateStr === today,
    });
  }

  // 주 단위로 분할
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div>
      <div className="flex gap-1 mb-1">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="w-6 text-center text-[#7b8a96] text-[10px]">{d}</div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={day.date}
                className={`w-6 h-6 rounded-sm transition-colors ${
                  day.isToday
                    ? "ring-1 ring-[#ff4655]"
                    : ""
                } ${
                  day.attended
                    ? "bg-[#ff4655]"
                    : "bg-[#111c24] border border-[#2a3540]"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="w-3 h-3 rounded-sm bg-[#111c24] border border-[#2a3540]" />
        <span className="text-[#7b8a96] text-[10px]">미출석</span>
        <div className="w-3 h-3 rounded-sm bg-[#ff4655] ml-2" />
        <span className="text-[#7b8a96] text-[10px]">출석</span>
      </div>
    </div>
  );
}
