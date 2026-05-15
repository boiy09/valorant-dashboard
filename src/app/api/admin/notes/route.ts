import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminNote" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "guildId" TEXT NOT NULL,
      "targetDiscordId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "issuedBy" TEXT NOT NULL DEFAULT '관리자 (웹)',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  await ensureTable();

  const discordId = req.nextUrl.searchParams.get("discordId");
  if (!discordId) return Response.json({ error: "discordId가 필요합니다." }, { status: 400 });

  const notes = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      targetDiscordId: string;
      content: string;
      issuedBy: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(
    `SELECT id, "targetDiscordId", content, "issuedBy", "createdAt", "updatedAt" FROM "AdminNote" WHERE "targetDiscordId" = $1 ORDER BY "createdAt" DESC`,
    discordId
  );

  return Response.json({ notes });
}

export async function POST(req: NextRequest) {
  const { isAdmin, guild: sessionGuild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  await ensureTable();

  const guild = sessionGuild ?? (await prisma.guild.findFirst());
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { discordId, content, issuedBy } = body as {
    discordId?: string;
    content?: string;
    issuedBy?: string;
  };

  if (!discordId || !content?.trim()) {
    return Response.json({ error: "discordId와 내용을 입력해주세요." }, { status: 400 });
  }

  const id = `note_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const resolvedIssuedBy = issuedBy?.trim() || "관리자 (웹)";

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AdminNote" (id, "guildId", "targetDiscordId", content, "issuedBy", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    id,
    guild.id,
    discordId,
    content.trim(),
    resolvedIssuedBy,
    now
  );

  const note = {
    id,
    guildId: guild.id,
    targetDiscordId: discordId,
    content: content.trim(),
    issuedBy: resolvedIssuedBy,
    createdAt: now,
    updatedAt: now,
  };

  return Response.json({ note });
}
