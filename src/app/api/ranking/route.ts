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

function getActivityIntervalInRange(
  joinedAt: Date,
  leftAt: Date | null,
  duration: number | null,
  rangeStart: Date,
  rangeEnd: Date
) {
  if (!duration || duration <= 0) return null;

  const cappedDuration = Math.min(duration, MAX_CONTINUOUS_ACTIVITY_SECONDS);
  const recordedEnd = leftAt ?? new Date(joinedAt.getTime() + duration * 1000);
  const cappedEnd = new Date(joinedAt.getTime() + cappedDuration * 1000);
  const activityEnd = recordedEnd < cappedEnd ? recordedEnd : cappedEnd;
  const start = joinedAt > rangeStart ? joinedAt : rangeStart;
  const end = activityEnd < rangeEnd ? activityEnd : rangeEnd;
  if (end <= start) return null;

  return { start: start.getTime(), end: end.getTime() };
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
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const type = req.nextUrl.searchParams.get("type") ?? "weekly"; // weekly | monthly

  const todayKey = toKstDateKey(new Date());
  const periodEnd = kstDateKeyToUtcStart(todayKey);
  let since: Date;
  if (type === "weekly") {
    since = kstDateKeyToUtcStart(toKstDateKey(addDays(kstDateKeyToUtcStart(todayKey), -6)));
  } else {
    since = kstDateKeyToUtcStart(`${todayKey.slice(0, 7)}-01`);
  }
  const now = new Date();

  const guildFilter = guildDiscordId
    ? { guild: { discordId: guildDiscordId } }
    : {};

  const activities = await prisma.voiceActivity.findMany({
    where: {
      duration: { not: null },
      joinedAt: { gte: since },
      ...guildFilter,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          discordId: true,
          image: true,
          guilds: {
            select: {
              nickname: true,
              guild: { select: { discordId: true } },
            },
          },
        },
      },
    },
  });

  const userMap = new Map<
    string,
    { name: string; discordId: string | null; image: string | null; intervals: ActivityInterval[] }
  >();
  for (const a of activities) {
    if (isExcludedVoiceChannel(a.channelName)) continue;

    const interval = getActivityIntervalInRange(a.joinedAt, a.leftAt, a.duration, since, now);
    if (!interval) continue;

    const guildNickname =
      a.user.guilds.find((member) =>
        guildDiscordId ? member.guild.discordId === guildDiscordId : Boolean(member.nickname)
      )?.nickname ?? null;
    const displayName = guildNickname ?? a.user.name ?? "Unknown";

    const existing = userMap.get(a.userId);
    if (existing) {
      existing.intervals.push(interval);
    } else {
      userMap.set(a.userId, {
        name: displayName,
        discordId: a.user.discordId,
        image: a.user.image,
        intervals: [interval],
      });
    }
  }

  const ranking = Array.from(userMap.entries())
    .map(([userId, data]) => ({
      userId,
      name: data.name,
      discordId: data.discordId,
      image: data.image,
      seconds: getMergedIntervalSeconds(data.intervals),
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      seconds: item.seconds,
      hours: Math.floor(item.seconds / 3600),
      minutes: Math.floor((item.seconds % 3600) / 60),
    }));

  return Response.json({
    ranking,
    type,
    period: {
      start: toKstDateKey(since),
      end: toKstDateKey(periodEnd),
    },
  });
}
