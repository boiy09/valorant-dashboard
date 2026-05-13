import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { note } = body as { note?: string };

  if (typeof note !== "string") {
    return Response.json({ error: "note 값이 필요합니다." }, { status: 400 });
  }

  const updated = await prisma.warning.update({
    where: { id },
    data: { note: note.trim() || null },
  });

  return Response.json({ warning: updated });
}
