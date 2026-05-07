"use client";

import { useEffect, useState } from "react";
import AttendanceCalendar from "./AttendanceCalendar";
import BotStatus from "./BotStatus";

interface ActivityData {
  weeklyData: { date: string; hours: number }[];
  attendanceDates: string[];
  activitySecondsByDate: Record<string, number>;
  totalSeconds: number;
  monthSeconds: number;
  attendanceCount: number;
}

interface RankingEntry {
  rank: number;
  name: string;
  seconds: number;
  hours: number;
  minutes: number;
  image: string | null;
}

interface RankingPeriod {
  start: string;
  end: string;
}

function fmtTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

function fmtRankingTime(seconds: number, hours: number, minutes: number) {
  if (seconds < 60) return `${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function fmtDateRange(period: RankingPeriod | null) {
  if (!period) return "";

  const format = (date: string) => date.replaceAll("-", ".");
  return `${format(period.start)} - ${format(period.end)}`;
}

function isActivityData(value: unknown): value is ActivityData {
  if (!value || typeof value !== "object") return false;

  const data = value as Partial<ActivityData>;
  return (
    Array.isArray(data.weeklyData) &&
    Array.isArray(data.attendanceDates) &&
    typeof data.activitySecondsByDate === "object" &&
    data.activitySecondsByDate !== null &&
    typeof data.totalSeconds === "number" &&
    typeof data.monthSeconds === "number" &&
    typeof data.attendanceCount === "number"
  );
}

export default function ActivityPageClient() {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [activityReady, setActivityReady] = useState(false);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [rankingPeriod, setRankingPeriod] = useState<RankingPeriod | null>(null);
  const [rankType, setRankType] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    fetch("/api/activity")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        setActivity(isActivityData(data) ? data : null);
      })
      .catch(() => setActivity(null))
      .finally(() => setActivityReady(true));
  }, []);

  useEffect(() => {
    fetch(`/api/ranking?type=${rankType}`)
      .then((response) => response.json())
      .then((data) => {
        setRanking(Array.isArray(data?.ranking) ? data.ranking : []);
        setRankingPeriod(
          typeof data?.period?.start === "string" && typeof data?.period?.end === "string" ? data.period : null
        );
      })
      .catch(() => {
        setRanking([]);
        setRankingPeriod(null);
      });
  }, [rankType]);

  const summaryCards = [
    { label: "This Month", value: activity ? fmtTime(activity.monthSeconds) : "--" },
    { label: "Total Time", value: activity ? fmtTime(activity.totalSeconds) : "--" },
    { label: "Attendance", value: activity ? `${activity.attendanceCount}d` : "--" },
  ];

  const attendanceEmptyText = activityReady ? "No attendance data yet." : "Loading...";

  return (
    <div>
      <PageHeader label="Dashboard" sub="Activity overview and server stats" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {summaryCards.map((item) => (
              <div key={item.label} className="val-card p-4">
                <div className="mb-1 text-xs uppercase tracking-wider text-[#7b8a96]">{item.label}</div>
                <div className="text-xl font-black text-white">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="val-card p-5">
            <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">Attendance Calendar</div>
            {activity ? (
              <AttendanceCalendar
                attendanceDates={activity.attendanceDates}
                activitySecondsByDate={activity.activitySecondsByDate}
              />
            ) : (
              <div className="text-sm text-[#7b8a96]">{attendanceEmptyText}</div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="val-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Activity Ranking</div>
                <div className="mt-1 text-[11px] font-semibold text-[#8da0ad]">{fmtDateRange(rankingPeriod)}</div>
              </div>
              <div className="flex gap-1">
                {(["weekly", "monthly"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setRankType(type)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      rankType === type ? "bg-[#ff4655] text-white" : "text-[#7b8a96] hover:text-white"
                    }`}
                  >
                    {type === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            {ranking.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#7b8a96]">
                No ranking data yet.
                <br />
                <span className="text-xs">Voice activity will appear here after members start using the server.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {ranking.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-3 py-1.5 ${entry.rank <= 3 ? "stat-highlight rounded px-2" : ""}`}
                  >
                    <span
                      className={`w-5 text-center text-sm font-black ${
                        entry.rank === 1
                          ? "text-yellow-400"
                          : entry.rank === 2
                            ? "text-zinc-300"
                            : entry.rank === 3
                              ? "text-amber-600"
                              : "text-[#7b8a96]"
                      }`}
                    >
                      {entry.rank}
                    </span>
                    {entry.image ? (
                      <img src={entry.image} alt={entry.name} className="h-7 w-7 rounded-full" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#7b8a96]">
                        {entry.name?.[0]}
                      </div>
                    )}
                    <span className="flex-1 truncate text-sm text-white">{entry.name}</span>
                    <span className="whitespace-nowrap text-xs font-bold text-[#ff4655]">
                      {fmtRankingTime(entry.seconds, entry.hours, entry.minutes)}
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
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">VALORANT DASHBOARD</div>
      <h1 className="text-2xl font-black text-white">{label}</h1>
      {sub && <p className="mt-0.5 text-sm text-[#7b8a96]">{sub}</p>}
    </div>
  );
}
