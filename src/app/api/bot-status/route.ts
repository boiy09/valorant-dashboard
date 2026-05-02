import { prisma } from "@/lib/prisma";

export async function GET() {
  const startTime = Date.now();

  try {
    // DB 연결 확인
    await prisma.$queryRaw`SELECT 1`;
    const dbOk = true;
    const dbLatency = Date.now() - startTime;

    // 통계
    const [userCount, scrimCount, announcementCount] = await Promise.all([
      prisma.user.count(),
      prisma.scrimSession.count(),
      prisma.announcement.count(),
    ]);

    // 오늘 출석
    const today = new Date().toISOString().slice(0, 10);
    const todayAttendance = await prisma.dailyAttendance.count({ where: { date: today } });

    return Response.json({
      status: "정상",
      db: { status: dbOk ? "정상" : "오류", latency: dbLatency },
      stats: {
        users: userCount,
        scrims: scrimCount,
        announcements: announcementCount,
        todayAttendance,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({
      status: "오류",
      db: { status: "오류", latency: -1 },
      error: String(e),
    }, { status: 500 });
  }
}
