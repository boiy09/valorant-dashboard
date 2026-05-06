import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const EXCLUDED_CHANNEL_KEYWORDS = ["잠수", "afk"];
const MAX_CONTINUOUS_ACTIVITY_SECONDS = 18 * 60 * 60;

type ActivityInterval = {
  start: number;
  end: number;
};

function toKstDateKey(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstDateKeyToUtcStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000+09:00`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isExcludedVoiceChannel(channelName: string) {
  const normalized = channelName.toLowerCase().replace(/\s/g, "");
  return EXCLUDED_CHANNEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function addActivityIntervalsByKstDay(
  acc: Record<string, ActivityInterval[]>,
  joinedAt: Date,
  leftAt: Date | null,
  duration: number | null
) {
  if (!duration || duration <= 0) return;

  const start = joinedAt;
  const cappedDuration = Math.min(duration, MAX_CONTINUOUS_ACTIVITY_SECONDS);
  const recordedEnd = leftAt ?? new Date(joinedAt.getTime() + duration * 1000);
  const cappedEnd = new Date(joinedAt.getTime() + cappedDuration * 1000);
  const end = recordedEnd < cappedEnd ? recordedEnd : cappedEnd;
  if (end <= start) return;

  let cursor = new Date(start);
  while (cursor < end) {
    const key = toKstDateKey(cursor);
    const nextDayStart = addDays(kstDateKeyToUtcStart(key), 1);
    const segmentEnd = nextDayStart < end ? nextDayStart : end;
    acc[key] = acc[key] ?? [];
    acc[key].push({ start: cursor.getTime(), end: segmentEnd.getTime() });
    cursor = segmentEnd;
  }
}

function getMergedIntervalSeconds(intervals: ActivityInterval[]) {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const interval of sorted) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }

    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }

    total += Math.floor((currentEnd - currentStart) / 1000);
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  if (currentStart !== null && currentEnd !== null) {
    total += Math.floor((currentEnd - currentStart) / 1000);
  }

  return total;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  if (!user) {
    return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const guildFilter = guildDiscordId ? { guild: { discordId: guildDiscordId } } : {};

  const allActivities = await prisma.voiceActivity.findMany({
    where: {
      userId: user.id,
      duration: { not: null },
      ...guildFilter,
    },
    select: { joinedAt: true, leftAt: true, duration: true, channelName: true },
    orderBy: { joinedAt: "asc" },
  });

  const activityIntervalsByDate: Record<string, ActivityInterval[]> = {};
  for (const activity of allActivities) {
    if (isExcludedVoiceChannel(activity.channelName)) continue;
    addActivityIntervalsByKstDay(activityIntervalsByDate, activity.joinedAt, activity.leftAt, activity.duration);
  }

  const activitySecondsByDate = Object.fromEntries(
    Object.entries(activityIntervalsByDate).map(([date, intervals]) => [date, getMergedIntervalSeconds(intervals)])
  );

  const weeklyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = toKstDateKey(date);
    weeklyMap[key] = activitySecondsByDate[key] ?? 0;
  }

  const weeklyData = Object.entries(weeklyMap).map(([date, seconds]) => ({
    date,
    hours: Math.round((seconds / 3600) * 10) / 10,
  }));

  const attendanceDates = Object.entries(activitySecondsByDate)
    .filter(([, seconds]) => seconds > 0)
    .map(([date]) => date)
    .sort();

  const currentMonthPrefix = toKstDateKey(new Date()).slice(0, 7);
  const totalSeconds = Object.values(activitySecondsByDate).reduce((sum, seconds) => sum + seconds, 0);
  const monthSeconds = Object.entries(activitySecondsByDate)
    .filter(([date]) => date.startsWith(currentMonthPrefix))
    .reduce((sum, [, seconds]) => sum + seconds, 0);

  return Response.json({
    weeklyData,
    attendanceDates,
    activitySecondsByDate,
    totalSeconds,
    monthSeconds,
    attendanceCount: attendanceDates.length,
  });
}
