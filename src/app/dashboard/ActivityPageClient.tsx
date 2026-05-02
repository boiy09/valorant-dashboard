"use client";

import { useState, useEffect } from "react";
import ActivityChart from "./ActivityChart";
import AttendanceCalendar from "./AttendanceCalendar";
import BotStatus from "./BotStatus";

interface ActivityData {
  weeklyData: { date: string; hours: number }[];
  attendanceDates: string[];
  totalSeconds: number;
  monthSeconds: number;
  attendanceCount: number;
}

interface RankingEntry {
  rank: number;
  name: string;
  hours: number;
  minutes: number;
  image: string | null;
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`;
}

export default function ActivityPageClient() {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [rankType, setRankType] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    fetch("/api/activity").then(r => r.json()).then(setActivity).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/ranking?type=${rankType}`)
      .then(r => r.json())
      .then(d => setRanking(d.ranking ?? []))
      .catch(() => {});
  }, [rankType]);

  return (
    <div>
      <PageHeader label="대시보드" sub="음성 활동 현황 및 서버 통계" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 왼쪽: 통계 + 차트 + 캘린더 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* 요약 카드 3개 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "이번달 활동", value: activity ? fmtTime(activity.monthSeconds) : "—" },
              { label: "총 활동",     value: activity ? fmtTime(activity.totalSeconds) : "—" },
              { label: "출석 (30일)", value: activity ? `${activity.attendanceCount}일` : "—" },
            ].map((s) => (
              <div key={s.label} className="val-card p-4">
                <div className="text-[#7b8a96] text-xs tracking-wider uppercase mb-1">{s.label}</div>
                <div className="text-white font-black text-xl">{s.value}</div>
              </div>
            ))}
          </div>

          {/* 주간 차트 */}
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">주간 활동</div>
            {activity
              ? <ActivityChart data={activity.weeklyData} />
              : <div className="h-20 flex items-center justify-center text-[#7b8a96] text-sm">로딩 중...</div>
            }
          </div>

          {/* 출석 캘린더 */}
          <div className="val-card p-5">
            <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">출석 현황 (4주)</div>
            {activity
              ? <AttendanceCalendar attendanceDates={activity.attendanceDates} />
              : <div className="text-[#7b8a96] text-sm">로딩 중...</div>
            }
          </div>
        </div>

        {/* 오른쪽: 랭킹 + 봇 상태 */}
        <div className="flex flex-col gap-4">
          <div className="val-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[#7b8a96] text-xs tracking-widest uppercase">활동 랭킹</div>
              <div className="flex gap-1">
                {(["weekly", "monthly"] as const).map(t => (
                  <button key={t} onClick={() => setRankType(t)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${rankType === t ? "bg-[#ff4655] text-white" : "text-[#7b8a96] hover:text-white"}`}>
                    {t === "weekly" ? "주간" : "월간"}
                  </button>
                ))}
              </div>
            </div>

            {ranking.length === 0 ? (
              <div className="text-[#7b8a96] text-sm text-center py-8">
                아직 활동 데이터가 없어요<br />
                <span className="text-xs">음성채널 입장 시 자동 기록돼요</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {ranking.map((r) => (
                  <div key={r.rank} className={`flex items-center gap-3 py-1.5 ${r.rank <= 3 ? "stat-highlight px-2 rounded" : ""}`}>
                    <span className={`text-sm font-black w-5 text-center ${r.rank === 1 ? "text-yellow-400" : r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-[#7b8a96]"}`}>
                      {r.rank}
                    </span>
                    {r.image
                      ? <img src={r.image} alt={r.name} className="w-7 h-7 rounded-full" />
                      : <div className="w-7 h-7 rounded-full bg-[#2a3540] flex items-center justify-center text-xs text-[#7b8a96]">{r.name?.[0]}</div>
                    }
                    <span className="flex-1 text-white text-sm truncate">{r.name}</span>
                    <span className="text-[#ff4655] text-xs font-bold whitespace-nowrap">
                      {r.hours > 0 ? `${r.hours}h ${r.minutes}m` : `${r.minutes}m`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <BotStatus />
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
      <h1 className="text-2xl font-black text-white">{label}</h1>
      {sub && <p className="text-[#7b8a96] text-sm mt-0.5">{sub}</p>}
    </div>
  );
}
