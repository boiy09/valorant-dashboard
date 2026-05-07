"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AttendanceCalendar from "./AttendanceCalendar";
import BotStatus from "./BotStatus";

interface ActivityData {
  weeklyData: { date: string; hours: number }[];
  attendanceDates: string[];
  activitySecondsByDate: Record<string, number>;
  totalSeconds: number;
  monthSeconds: number;
  attendanceCount: number;
  minAttendanceSeconds?: number;
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

interface TierDistributionItem {
  key: string;
  label: string;
  color: string;
  count: number;
  percent: number;
  icon: string | null;
}

interface TierDistributionRegion {
  region: "KR" | "AP";
  label: string;
  total: number;
  tiers: TierDistributionItem[];
}

interface TierDistributionData {
  regions: {
    KR: TierDistributionRegion;
    AP: TierDistributionRegion;
  };
  generatedAt: string;
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

function getVisibleTiers(region: TierDistributionRegion) {
  const active = region.tiers.filter((tier) => tier.count > 0);
  return active.length > 0 ? active : region.tiers.slice(0, 1);
}

function getPieStyle(region: TierDistributionRegion): CSSProperties {
  const visibleTiers = getVisibleTiers(region);
  if (region.total === 0) {
    return { background: "conic-gradient(#263442 0deg 360deg)" };
  }

  let current = 0;
  const segments = visibleTiers.map((tier) => {
    const start = current;
    const end = current + (tier.count / region.total) * 360;
    current = end;
    return `${tier.color} ${start}deg ${end}deg`;
  });

  return { background: `conic-gradient(${segments.join(", ")})` };
}

function TierDistributionPanel({
  data,
  ready,
  chartType,
  onChartTypeChange,
}: {
  data: TierDistributionData | null;
  ready: boolean;
  chartType: "bar" | "pie";
  onChartTypeChange: (type: "bar" | "pie") => void;
}) {
  return (
    <div className="val-card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Tier Distribution</div>
          <div className="mt-1 text-sm text-[#8da0ad]">URL로 연동된 Riot 계정 기준</div>
        </div>
        <div className="flex gap-1">
          {(["bar", "pie"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onChartTypeChange(type)}
              className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                chartType === type ? "bg-[#ff4655] text-white" : "text-[#7b8a96] hover:text-white"
              }`}
            >
              {type === "bar" ? "막대" : "원형"}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <div className="py-10 text-center text-sm text-[#7b8a96]">티어 정보를 불러오는 중입니다.</div>
      ) : !data ? (
        <div className="py-10 text-center text-sm text-[#7b8a96]">티어 정보를 불러오지 못했습니다.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TierDistributionChart region={data.regions.KR} chartType={chartType} />
          <TierDistributionChart region={data.regions.AP} chartType={chartType} />
        </div>
      )}
    </div>
  );
}

function TierDistributionChart({
  region,
  chartType,
}: {
  region: TierDistributionRegion;
  chartType: "bar" | "pie";
}) {
  const visibleTiers = getVisibleTiers(region);

  return (
    <div className="border border-[#263442] bg-[#0b1721]/60 p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-black text-white">{region.label}</div>
          <div className="text-xs text-[#7b8a96]">연동 계정 {region.total}개</div>
        </div>
        <div className="text-xs font-bold text-[#ff4655]">{region.region}</div>
      </div>

      {region.total === 0 ? (
        <div className="flex h-56 items-center justify-center border border-dashed border-[#263442] text-sm text-[#7b8a96]">
          연동된 계정이 없습니다.
        </div>
      ) : chartType === "bar" ? (
        <div className="space-y-3">
          {visibleTiers.map((tier) => (
            <div key={tier.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  {tier.icon ? <img src={tier.icon} alt={tier.label} className="h-5 w-5 object-contain" /> : null}
                  {tier.label}
                </span>
                <span className="text-[#8da0ad]">
                  {tier.count}명 · {tier.percent}%
                </span>
              </div>
              <div className="h-3 overflow-hidden bg-[#172431]">
                <div
                  className="h-full"
                  style={{ width: `${Math.max(tier.percent, 3)}%`, backgroundColor: tier.color }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
          <div className="relative mx-auto h-40 w-40 rounded-full" style={getPieStyle(region)}>
            <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-[#0b1721]">
              <span className="text-2xl font-black text-white">{region.total}</span>
              <span className="text-xs text-[#7b8a96]">계정</span>
            </div>
          </div>
          <div className="space-y-2">
            {visibleTiers.map((tier) => (
              <div key={tier.key} className="flex items-center gap-2 text-xs">
                {tier.icon ? (
                  <img src={tier.icon} alt={tier.label} className="h-5 w-5 object-contain" />
                ) : (
                  <span className="h-2.5 w-2.5" style={{ backgroundColor: tier.color }} />
                )}
                <span className="flex-1 font-bold text-white">{tier.label}</span>
                <span className="text-[#8da0ad]">
                  {tier.count}명 · {tier.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  const [tierDistribution, setTierDistribution] = useState<TierDistributionData | null>(null);
  const [tierDistributionReady, setTierDistributionReady] = useState(false);
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");

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

  useEffect(() => {
    fetch("/api/tier-distribution")
      .then((response) => response.json())
      .then((data) => {
        const kr = data?.regions?.KR;
        const ap = data?.regions?.AP;
        setTierDistribution(kr && ap ? data : null);
      })
      .catch(() => setTierDistribution(null))
      .finally(() => setTierDistributionReady(true));
  }, []);

  const attendanceEmptyText = activityReady ? "No attendance data yet." : "Loading...";

  return (
    <div>
      <PageHeader label="Dashboard" sub="Activity overview and server stats" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <TierDistributionPanel
            data={tierDistribution}
            ready={tierDistributionReady}
            chartType={chartType}
            onChartTypeChange={setChartType}
          />

          <div className="val-card p-5">
            <div className="mb-3 text-xs uppercase tracking-widest text-[#7b8a96]">Attendance Calendar</div>
            {activity ? (
              <AttendanceCalendar
                attendanceDates={activity.attendanceDates}
                activitySecondsByDate={activity.activitySecondsByDate}
                minAttendanceSeconds={activity.minAttendanceSeconds ?? 600}
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
