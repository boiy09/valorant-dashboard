import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

interface BotStatusCache {
  data: object;
  cachedAt: number;
}

let statusCache: BotStatusCache | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET() {
  const now = Date.now();

  if (statusCache && now - statusCache.cachedAt < CACHE_TTL_MS) {
    return Response.json(statusCache.data);
  }

  const startTime = now;

  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    const [userCount, scrimCount, announcementCount] = await Promise.all([
      prisma.user.count(),
      prisma.scrimSession.count(),
      prisma.announcement.count(),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const todayAttendance = await prisma.dailyAttendance.count({ where: { date: today } });

    const data = {
      status: "정상",
      db: { status: "정상", latency: dbLatency },
      stats: {
        users: userCount,
        scrims: scrimCount,
        announcements: announcementCount,
        todayAttendance,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    statusCache = { data, cachedAt: Date.now() };
    return Response.json(data);
  } catch (e) {
    return Response.json({
      status: "오류",
      db: { status: "오류", latency: -1 },
      error: String(e),
    }, { status: 500 });
  }
}
