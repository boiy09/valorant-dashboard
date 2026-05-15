import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

  const events = await prisma.scrimEvent.findMany({
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return Response.json({ events });
}

export async function DELETE(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id가 필요합니다." }, { status: 400 });

  await prisma.scrimEvent.delete({ where: { id } }).catch(() => null);

  broadcast("schedule", { action: "deleted", id }).catch(() => {});
  return Response.json({ success: true });
}
