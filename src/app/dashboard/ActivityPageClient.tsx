"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AttendanceCalendar from "./AttendanceCalendar";

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

interface TierDistributionGroup {
  key: string;
  label: string;
  color: string;
  count: number;
  percent: number;
  tiers: TierDistributionItem[];
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

function rankingRowClass(rank: number) {
  if (rank === 1) return "rounded border-l-2 border-yellow-400 bg-yellow-400/10 px-2";
  if (rank === 2) return "rounded border-l-2 border-zinc-300 bg-zinc-300/10 px-2";
  if (rank === 3) return "rounded border-l-2 border-amber-600 bg-amber-600/10 px-2";
  return "px-2";
}

function rankingAccentTextClass(rank: number) {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-amber-600";
  return "text-[#ff4655]";
}

function rankingBasisText(type: "weekly" | "monthly") {
  const period = type === "weekly" ? "최근 7일" : "이번 달 1일부터 현재";
  return `${period} · 음성 채널 체류 시간 합산 · 겹친 기록 병합 · 잠수/AFK 채널 제외 · 단일 세션 최대 18시간`;
}

function getVisibleTiers(region: TierDistributionRegion) {
  const active = region.tiers.filter((tier) => tier.count > 0);
  return active.length > 0 ? active : region.tiers.slice(0, 1);
}

function getTierGroupKey(tier: TierDistributionItem) {
  if (tier.key === "UNRANKED" || tier.key === "RADIANT") return tier.key;
  return tier.key.split("_")[0] ?? tier.key;
}

function getTierGroupLabel(tier: TierDistributionItem) {
  if (tier.key === "UNRANKED" || tier.key === "RADIANT") return tier.label;
  return tier.label.replace(/\s+[123]$/, "");
}

function getVisibleTierGroups(region: TierDistributionRegion): TierDistributionGroup[] {
  const visibleTiers = getVisibleTiers(region);
  const groups = new Map<string, TierDistributionGroup>();

  for (const tier of visibleTiers) {
    const key = getTierGroupKey(tier);
    const existing = groups.get(key);
    if (existing) {
      existing.count += tier.count;
      existing.percent = region.total > 0 ? Math.round((existing.count / region.total) * 1000) / 10 : 0;
      existing.tiers.push(tier);
    } else {
      groups.set(key, {
        key,
        label: getTierGroupLabel(tier),
        color: tier.color,
        count: tier.count,
        percent: tier.percent,
        tiers: [tier],
      });
    }
  }

  return Array.from(groups.values());
}

function getSubTierBrightness(tierKey: string): number {
  if (tierKey.endsWith("_1")) return 0.72;
  if (tierKey.endsWith("_3")) return 1.32;
  return 1.0;
}

function adjustBrightness(hex: string, factor: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  return `rgb(${clamp(r * factor)},${clamp(g * factor)},${clamp(b * factor)})`;
}

function getPieStyle(region: TierDistributionRegion, mode: "detail" | "group" = "detail"): CSSProperties {
  const groups = getVisibleTierGroups(region);
  if (region.total === 0) {
    return { background: "conic-gradient(#263442 0deg 360deg)" };
  }

  let current = 0;
  const segments: string[] = [];

  for (const group of groups) {
    if (mode === "group") {
      const deg = (group.count / region.total) * 360;
      if (deg <= 0) continue;
      const start = current;
      const end = current + deg;
      segments.push(`${group.color} ${start}deg ${end}deg`);
      current = end;
      continue;
    }

    for (const tier of group.tiers) {
      const deg = (tier.count / region.total) * 360;
      if (deg <= 0) continue;
      const start = current;
      const end = current + deg;
      const color = adjustBrightness(tier.color, getSubTierBrightness(tier.key));
      segments.push(`${color} ${start}deg ${end}deg`);
      current = end;
    }
  }

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
  const visibleGroups = getVisibleTierGroups(region);

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
          {visibleGroups.map((group) => (
            <div key={group.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  {group.tiers[0]?.icon ? (
                    <img src={group.tiers[0].icon} alt={group.label} className="h-5 w-5 object-contain" />
                  ) : null}
                  {group.label}
                </span>
                <span className="text-[#8da0ad]">
                  {group.count}명 · {group.percent}%
                </span>
              </div>
              <div className="h-5 rounded-sm border bg-[#172431] p-[2px]" style={{ borderColor: group.color }}>
                <div
                  className="flex h-full overflow-hidden rounded-[2px]"
                  style={{ width: `${Math.max(group.percent, 3)}%` }}
                >
                  {group.tiers.map((tier) => (
                    <div
                      key={tier.key}
                      className="h-full border-r border-[#0b1721]/50 last:border-r-0"
                      title={`${tier.label} ${tier.count}명`}
                      style={{
                        width: `${Math.max((tier.count / group.count) * 100, 6)}%`,
                        backgroundColor: adjustBrightness(tier.color, getSubTierBrightness(tier.key)),
                      }}
                    />
                  ))}
                </div>
              </div>
              {group.tiers.length > 1 ? (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {group.tiers.map((tier) => (
                    <span key={tier.key} className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8da0ad]">
                      {tier.icon ? (
                        <img src={tier.icon} alt={tier.label} className="h-3.5 w-3.5 object-contain" />
                      ) : (
                        <span
                          className="inline-block h-2 w-2 flex-shrink-0"
                          style={{ backgroundColor: adjustBrightness(tier.color, getSubTierBrightness(tier.key)) }}
                        />
                      )}
                      {tier.label} {tier.count}명
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[192px_1fr]">
          <div className="relative mx-auto h-44 w-44 flex-shrink-0 rounded-full p-[7px]" style={getPieStyle(region, "group")}>
            <div className="absolute inset-[5px] rounded-full border-[3px] border-[#0b1721]/85" />
            <div className="relative h-full w-full rounded-full" style={getPieStyle(region, "detail")}>
              <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-[#0b1721]">
              <span className="text-2xl font-black text-white">{region.total}</span>
              <span className="text-xs text-[#7b8a96]">계정</span>
              </div>
            </div>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 text-xs">
                  {group.tiers[0]?.icon ? (
                    <img src={group.tiers[0].icon} alt={group.label} className="h-5 w-5 flex-shrink-0 object-contain" />
                  ) : (
                    <span className="h-2.5 w-2.5 flex-shrink-0" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="flex-1 font-bold text-white">{group.label}</span>
                  <span className="text-[#8da0ad]">{group.count}명 · {group.percent}%</span>
                </div>
                {group.tiers.length > 1 && (
                  <div className="mt-0.5 ml-7 flex flex-col gap-0.5">
                    {group.tiers.map((tier) => (
                      <div key={tier.key} className="flex items-center gap-1.5 text-[10px] text-[#8da0ad]">
                        {tier.icon ? (
                          <img src={tier.icon} alt={tier.label} className="h-3.5 w-3.5 flex-shrink-0 object-contain" />
                        ) : (
                          <span
                            className="h-2 w-2 flex-shrink-0"
                            style={{ backgroundColor: adjustBrightness(tier.color, getSubTierBrightness(tier.key)) }}
                          />
                        )}
                        <span className="flex-1">{tier.label}</span>
                        <span>{tier.count}명</span>
                      </div>
                    ))}
                  </div>
                )}
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

function readSessionCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeSessionCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
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
    const cacheKey = "valorant-dashboard:tier-distribution";
    const cached = readSessionCache<TierDistributionData>(cacheKey, 10 * 60 * 1000);
    if (cached?.regions?.KR && cached?.regions?.AP) {
      setTierDistribution(cached);
      setTierDistributionReady(true);
    }

    fetch("/api/tier-distribution")
      .then((response) => response.json())
      .then((data) => {
        const kr = data?.regions?.KR;
        const ap = data?.regions?.AP;
        if (kr && ap) {
          setTierDistribution(data);
          writeSessionCache(cacheKey, data);
        } else if (!cached) {
          setTierDistribution(null);
        }
      })
      .catch(() => {
        if (!cached) setTierDistribution(null);
      })
      .finally(() => setTierDistributionReady(true));
  }, []);

  const attendanceEmptyText = activityReady ? "No attendance data yet." : "Loading...";

  return (
    <div>
      <PageHeader label="Dashboard" sub="Activity overview and server stats" />

      <div className="flex flex-col gap-4">
        {/* Tier Distribution — 가로 전체 */}
        <TierDistributionPanel
          data={tierDistribution}
          ready={tierDistributionReady}
          chartType={chartType}
          onChartTypeChange={setChartType}
        />

        {/* 하단: 캘린더+랭킹 (좌) / BotStatus (우) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(520px,1.15fr)_minmax(360px,0.85fr)]">
          {/* 캘린더 + 액티비티 랭킹 — 좌 2열 */}
          <>
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

            <div className="val-card p-5">
              <div className="mb-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-[#7b8a96]">Activity Ranking</div>
                  <div className="flex shrink-0 gap-1">
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
                <div className="mb-3 grid gap-1 border-l-2 border-[#ff4655] bg-[#ff4655]/10 px-3 py-2">
                  <div className="font-mono text-[11px] font-bold text-[#c8d3db]">{fmtDateRange(rankingPeriod)}</div>
                  <div className="text-[11px] font-semibold leading-relaxed text-[#ece8e1]">
                    {rankingBasisText(rankType)}
                  </div>
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
                      className={`grid grid-cols-[28px_36px_minmax(0,1fr)_72px] items-center gap-2 py-1.5 ${rankingRowClass(entry.rank)}`}
                    >
                      <span
                        className={`text-center text-sm font-black tabular-nums ${
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
                        <img src={entry.image} alt={entry.name} className="mx-auto h-7 w-7 rounded-full" />
                      ) : (
                        <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#2a3540] text-xs text-[#7b8a96]">
                          {entry.name?.[0]}
                        </div>
                      )}
                      <span className="truncate text-sm font-bold text-white">{entry.name}</span>
                      <span className={`whitespace-nowrap text-right text-xs font-bold tabular-nums ${rankingAccentTextClass(entry.rank)}`}>
                        {fmtRankingTime(entry.seconds, entry.hours, entry.minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>

          {/* BotStatus — 우 1열 */}
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
