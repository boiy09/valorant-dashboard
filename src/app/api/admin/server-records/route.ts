import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { ensureMemberJoinLogTable } from "@/lib/memberJoinLogs";
import { prisma } from "@/lib/prisma";

const KST_OFFSET = "+09:00";

type VoiceGroupRow = {
  userId: string;
  _sum: { duration: number | null };
};

type AttendanceGroupRow = {
  userId: string;
  _count: { _all: number };
};

type JoinRow = {
  userId: string;
  count: bigint;
};

type MemberRow = {
  userId: string;
  nickname: string | null;
  user: {
    discordId: string | null;
    name: string | null;
    image: string | null;
  };
};

function toDateKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function parseDateRange(req: NextRequest) {
  const today = toDateKey(new Date());
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const defaultStart = `${today.slice(0, 8)}01`;
  const startKey = /^\d{4}-\d{2}-\d{2}$/.test(startParam ?? "") ? startParam! : defaultStart;
  const endKey = /^\d{4}-\d{2}-\d{2}$/.test(endParam ?? "") ? endParam! : today;
  const start = new Date(`${startKey}T00:00:00.000${KST_OFFSET}`);
  const endExclusive = new Date(`${endKey}T00:00:00.000${KST_OFFSET}`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return { startKey, endKey, start, endExclusive };
}

function secondsToLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${seconds}초`;
}

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) return Response.json({ records: [], period: null });

  const { startKey, endKey, start, endExclusive } = parseDateRange(req);
  await ensureMemberJoinLogTable();

  const [members, voiceGroups, attendanceGroups, joinRows] = await Promise.all([
    prisma.guildMember.findMany({
      where: { guildId: guild.id },
      include: { user: { select: { id: true, name: true, image: true, discordId: true } } },
      orderBy: { nickname: "asc" },
    }),
    prisma.voiceActivity.groupBy({
      by: ["userId"],
      where: {
        guildId: guild.id,
        joinedAt: { gte: start, lt: endExclusive },
        duration: { not: null },
      },
      _sum: { duration: true },
    }),
    prisma.dailyAttendance.groupBy({
      by: ["userId"],
      where: {
        guildId: guild.id,
        date: { gte: startKey, lte: endKey },
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
      SELECT "userId", COUNT(*)::bigint AS count
      FROM "GuildMemberJoinLog"
      WHERE "guildId" = ${guild.id}
      GROUP BY "userId"
    `,
  ]);

  const voiceMap = new Map((voiceGroups as VoiceGroupRow[]).map((row) => [row.userId, row._sum.duration ?? 0]));
  const attendanceMap = new Map((attendanceGroups as AttendanceGroupRow[]).map((row) => [row.userId, row._count._all]));
  const joinMap = new Map((joinRows as JoinRow[]).map((row) => [row.userId, Number(row.count)]));

  const records = (members as MemberRow[])
    .map((member) => {
      const voiceSeconds = voiceMap.get(member.userId) ?? 0;
      return {
        userId: member.userId,
        discordId: member.user.discordId,
        name: member.nickname ?? member.user.name ?? "이름 없음",
        image: member.user.image,
        voiceSeconds,
        voiceTime: secondsToLabel(voiceSeconds),
        attendanceDays: attendanceMap.get(member.userId) ?? 0,
        rejoinCount: joinMap.get(member.userId) ?? 0,
      };
    })
    .sort((a, b) => b.voiceSeconds - a.voiceSeconds || b.attendanceDays - a.attendanceDays || a.name.localeCompare(b.name));

  return Response.json({
    period: { start: startKey, end: endKey },
    records,
  });
}
