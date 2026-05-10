import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");

  const events = await prisma.scrimEvent.findMany({
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return Response.json({ events });
}

export async function DELETE(req: NextRequest) {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "일정 ID가 필요합니다." }, { status: 400 });

  const deleted = await prisma.scrimEvent.deleteMany({
    where: {
      id,
      ...(guild ? { guildId: guild.id } : {}),
    },
  });

  if (deleted.count === 0) {
    return Response.json({ error: "삭제할 일정을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ success: true });
}
