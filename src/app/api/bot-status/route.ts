import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

interface StatusData {
  status: string;
  db: { status: string; latency: number };
  stats: { users: number; scrims: number; announcements: number; todayAttendance: number };
  uptime: number;
  timestamp: string;
}

// stale 캐시 — 마지막 성공 응답을 영구 보관 (새 인스턴스는 null로 시작)
let lastGood: StatusData | null = null;
let lastGoodAt = 0;
const FRESH_TTL_MS = 30_000; // 30초 이내면 DB 재조회 안 함

export async function GET() {
  const now = Date.now();

  if (lastGood && now - lastGoodAt < FRESH_TTL_MS) {
    return Response.json(lastGood);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const dbStartTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStartTime;

    const [userCount, scrimCount, announcementCount, todayAttendance] = await Promise.all([
      prisma.user.count(),
      prisma.scrimSession.count(),
      prisma.announcement.count(),
      prisma.dailyAttendance.count({ where: { date: today } }),
    ]);

    const data: StatusData = {
      status: "정상",
      db: { status: "정상", latency: dbLatency },
      stats: { users: userCount, scrims: scrimCount, announcements: announcementCount, todayAttendance },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    lastGood = data;
    lastGoodAt = Date.now();
    return Response.json(data);
  } catch (e) {
    console.error("[bot-status] DB query failed:", e);

    // 실패해도 마지막 성공 데이터 반환 (프론트에 에러 표시 안 함)
    if (lastGood) {
      return Response.json({
        ...lastGood,
        status: "캐시",
        timestamp: new Date().toISOString(),
      });
    }

    // 첫 요청부터 실패한 경우 — 최소한 오류 없는 응답 반환
    return Response.json({
      status: "점검 중",
      db: { status: "오류", latency: -1 },
      stats: { users: 0, scrims: 0, announcements: 0, todayAttendance: 0 },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
}
