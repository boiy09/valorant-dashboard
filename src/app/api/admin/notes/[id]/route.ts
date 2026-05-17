import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { content, issuedBy } = body as { content?: string; issuedBy?: string };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (typeof content === "string") {
    if (!content.trim()) return Response.json({ error: "메모 내용을 입력해 주세요." }, { status: 400 });
    setClauses.push(`content = $${idx++}`);
    values.push(content.trim());
  }
  if (typeof issuedBy === "string") {
    setClauses.push(`"issuedBy" = $${idx++}`);
    values.push(issuedBy.trim() || "관리자");
  }

  if (setClauses.length === 0) {
    return Response.json({ error: "수정할 값이 없습니다." }, { status: 400 });
  }

  setClauses.push(`"updatedAt" = $${idx++}`);
  values.push(new Date());
  values.push(id);

  await prisma.$executeRawUnsafe(
    `UPDATE "AdminNote" SET ${setClauses.join(", ")} WHERE id = $${idx}`,
    ...values
  );

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, "targetDiscordId", content, "issuedBy", "createdAt", "updatedAt" FROM "AdminNote" WHERE id = $1`,
    id
  );

  return Response.json({ note: rows[0] ?? null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await prisma.$executeRawUnsafe(`DELETE FROM "AdminNote" WHERE id = $1`, id);

  return Response.json({ ok: true });
}
