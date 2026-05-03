import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const type = req.nextUrl.searchParams.get("type") ?? "weekly"; // weekly | monthly

  const since = new Date();
  if (type === "weekly") {
    since.setDate(since.getDate() - 6);
  } else {
    since.setDate(1);
  }
  since.setHours(0, 0, 0, 0);

  const guildFilter = guildDiscordId
    ? { guild: { discordId: guildDiscordId } }
    : {};

  const activities = await prisma.voiceActivity.findMany({
    where: {
      joinedAt: { gte: since },
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
    const guildNickname =
      a.user.guilds.find((member) =>
        guildDiscordId ? member.guild.discordId === guildDiscordId : Boolean(member.nickname)
      )?.nickname ?? null;
    const displayName = guildNickname ?? a.user.name ?? "Unknown";

    const existing = userMap.get(a.userId);
    if (existing) {
      existing.seconds += a.duration ?? 0;
    } else {
      userMap.set(a.userId, {
        name: displayName,
        discordId: a.user.discordId,
        image: a.user.image,
        seconds: a.duration ?? 0,
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
