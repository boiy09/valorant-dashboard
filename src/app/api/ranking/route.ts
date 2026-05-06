import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const EXCLUDED_CHANNEL_KEYWORDS = ["잠수", "afk"];

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

function getActivitySecondsInRange(
  joinedAt: Date,
  leftAt: Date | null,
  duration: number | null,
  rangeStart: Date,
  rangeEnd: Date
) {
  if (!duration || duration <= 0) return 0;

  const activityEnd = leftAt ?? new Date(joinedAt.getTime() + duration * 1000);
  const start = joinedAt > rangeStart ? joinedAt : rangeStart;
  const end = activityEnd < rangeEnd ? activityEnd : rangeEnd;
  if (end <= start) return 0;

  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const type = req.nextUrl.searchParams.get("type") ?? "weekly"; // weekly | monthly

  const todayKey = toKstDateKey(new Date());
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

  const userMap = new Map<string, { name: string; discordId: string | null; image: string | null; seconds: number }>();
  for (const a of activities) {
    if (isExcludedVoiceChannel(a.channelName)) continue;

    const seconds = getActivitySecondsInRange(a.joinedAt, a.leftAt, a.duration, since, now);
    if (seconds <= 0) continue;

    const guildNickname =
      a.user.guilds.find((member) =>
        guildDiscordId ? member.guild.discordId === guildDiscordId : Boolean(member.nickname)
      )?.nickname ?? null;
    const displayName = guildNickname ?? a.user.name ?? "Unknown";

    const existing = userMap.get(a.userId);
    if (existing) {
      existing.seconds += seconds;
    } else {
      userMap.set(a.userId, {
        name: displayName,
        discordId: a.user.discordId,
        image: a.user.image,
        seconds,
      });
    }
  }

  const ranking = Array.from(userMap.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      seconds: item.seconds,
      hours: Math.floor(item.seconds / 3600),
      minutes: Math.floor((item.seconds % 3600) / 60),
    }));

  return Response.json({ ranking, type });
}
