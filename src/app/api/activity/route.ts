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
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  // 최근 30일 기준
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const guildFilter = guildDiscordId
    ? { guild: { discordId: guildDiscordId } }
    : {};

  // 주간 활동 데이터 (최근 7일)
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

  // 요일별 집계
  const weeklyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    weeklyMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const a of weeklyActivities) {
    const key = a.joinedAt.toISOString().slice(0, 10);
    if (key in weeklyMap) weeklyMap[key] += a.duration ?? 0;
  }
  const weeklyData = Object.entries(weeklyMap).map(([date, seconds]) => ({
    date,
    hours: Math.round((seconds / 3600) * 10) / 10,
  }));

  // 출석 데이터 (최근 30일)
  const sinceDate = since.toISOString().slice(0, 10);
  const attendances = await prisma.dailyAttendance.findMany({
    where: {
      userId: user.id,
      date: { gte: sinceDate },
      ...guildFilter,
    },
    select: { date: true },
  });
  const attendanceDates = attendances.map((a) => a.date);

  // 총 활동시간
  const totalActivity = await prisma.voiceActivity.aggregate({
    where: {
      userId: user.id,
      duration: { not: null },
      ...guildFilter,
    },
    _sum: { duration: true },
  });

  // 이번달 활동시간
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
