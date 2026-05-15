import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { syncWarningAutomation } from "@/lib/adminAutomation";
import { prisma } from "@/lib/prisma";

function resolveType(type?: string) {
  return type === "complaint" ? "complaint" : "warning";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { note, reason, issuedBy, active, type } = body as {
    note?: string;
    reason?: string;
    issuedBy?: string;
    active?: boolean;
    type?: string;
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (typeof note === "string") {
    setClauses.push(`note = $${idx++}`);
    values.push(note.trim() || null);
  }
  if (typeof reason === "string") {
    if (!reason.trim()) return Response.json({ error: "내용을 입력해 주세요." }, { status: 400 });
    setClauses.push(`reason = $${idx++}`);
    values.push(reason.trim());
  }
  if (typeof issuedBy === "string") {
    setClauses.push(`"issuedBy" = $${idx++}`);
    values.push(issuedBy.trim() || "관리자");
  }
  if (typeof active === "boolean") {
    setClauses.push(`active = $${idx++}`);
    values.push(active);
  }
  if (typeof type === "string") {
    setClauses.push(`type = $${idx++}`);
    values.push(resolveType(type));
  }

  if (setClauses.length === 0) {
    return Response.json({ error: "수정할 값이 없습니다." }, { status: 400 });
  }

  setClauses.push(`"updatedAt" = $${idx++}`);
  values.push(new Date());
  values.push(id);

  await prisma.$executeRawUnsafe(
    `UPDATE "Warning" SET ${setClauses.join(", ")} WHERE id = $${idx}`,
    ...values
  );

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, "userId", "guildId", reason, "issuedBy", active, note, COALESCE(type, 'warning') AS type, "createdAt", "updatedAt" FROM "Warning" WHERE id = $1`,
    id
  );

  const updated = rows[0];
  if (typeof updated?.userId === "string" && typeof updated?.guildId === "string") {
    await syncWarningAutomation(updated.userId, updated.guildId).catch((error) => {
      console.error("[warnings] automation sync failed:", error);
    });
  }

  return Response.json({ warning: rows[0] ?? null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; guildId: string }>>(
    `SELECT "userId", "guildId" FROM "Warning" WHERE id = $1`,
    id
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "Warning" WHERE id = $1`, id);

  const deleted = rows[0];
  if (deleted) {
    await syncWarningAutomation(deleted.userId, deleted.guildId).catch((error) => {
      console.error("[warnings] automation sync failed:", error);
    });
  }

  return Response.json({ ok: true });
}
