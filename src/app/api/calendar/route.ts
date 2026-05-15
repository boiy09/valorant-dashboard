import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function itemDate(session: {
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}) {
  return session.scheduledAt ?? session.startedAt ?? session.endedAt ?? session.createdAt;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const start = parseDate(req.nextUrl.searchParams.get("start"), defaultStart);
  const end = parseDate(req.nextUrl.searchParams.get("end"), defaultEnd);

  const [events, scrims] = await Promise.all([
    prisma.scrimEvent.findMany({
      where: { scheduledAt: { gte: start, lte: end } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.scrimSession.findMany({
      where: {
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { startedAt: { gte: start, lte: end } },
          { endedAt: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { players: true } } },
    }),
  ]);

  const items = [
    ...events.map((event) => ({
      id: event.id,
      type: "schedule" as const,
      title: event.title,
      description: event.description,
      date: event.scheduledAt.toISOString(),
      status: "scheduled",
      createdBy: event.createdBy,
      participantCount: null,
      href: null,
    })),
    ...scrims
      .map((scrim) => ({
        id: scrim.id,
        type: scrim.mode === "auction" ? ("auction" as const) : ("scrim" as const),
        title: scrim.title,
        description: scrim.description,
        date: itemDate(scrim).toISOString(),
        status: scrim.status,
        createdBy: scrim.createdBy,
        participantCount: scrim._count.players,
        href: `/dashboard/scrim/${scrim.id}`,
      }))
      .filter((item) => {
        const date = new Date(item.date);
        return date >= start && date <= end;
      }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return Response.json({ items });
}
