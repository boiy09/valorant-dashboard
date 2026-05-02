import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const guildFilter = guildDiscordId ? { guild: { discordId: guildDiscordId } } : {};

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const weeklyActivities = await prisma.voiceActivity.findMany({
    where: {
      userId: user.id,
      joinedAt: { gte: weekAgo },
      duration: { not: null },
      ...guildFilter,
    },
    select: { joinedAt: true, duration: true },
  });

  const weeklyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    weeklyMap[date.toISOString().slice(0, 10)] = 0;
  }

  for (const activity of weeklyActivities) {
    const key = activity.joinedAt.toISOString().slice(0, 10);
    if (key in weeklyMap) weeklyMap[key] += activity.duration ?? 0;
  }

  const weeklyData = Object.entries(weeklyMap).map(([date, seconds]) => ({
    date,
    hours: Math.round((seconds / 3600) * 10) / 10,
  }));

  const sinceDate = since.toISOString().slice(0, 10);
  const attendances = await prisma.dailyAttendance.findMany({
    where: {
      userId: user.id,
      date: { gte: sinceDate },
      ...guildFilter,
    },
    select: { date: true },
  });
  const attendanceDates = attendances.map((attendance) => attendance.date);

  const totalActivity = await prisma.voiceActivity.aggregate({
    where: {
      userId: user.id,
      duration: { not: null },
      ...guildFilter,
    },
    _sum: { duration: true },
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthActivity = await prisma.voiceActivity.aggregate({
    where: {
      userId: user.id,
      joinedAt: { gte: monthStart },
      duration: { not: null },
      ...guildFilter,
    },
    _sum: { duration: true },
  });

  return Response.json({
    weeklyData,
    attendanceDates,
    totalSeconds: totalActivity._sum.duration ?? 0,
    monthSeconds: monthActivity._sum.duration ?? 0,
    attendanceCount: attendanceDates.length,
  });
}
