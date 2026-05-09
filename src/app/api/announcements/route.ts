import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function resolveWritableGuild(guildDiscordId?: string | null) {
  const { guild: sessionGuild } = await getAdminSession();

  if (guildDiscordId) {
    return prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
  }

  if (sessionGuild) return sessionGuild;

  if (process.env.DISCORD_GUILD_ID) {
    return prisma.guild.findUnique({ where: { discordId: process.env.DISCORD_GUILD_ID } });
  }

  return prisma.guild.findFirst();
}

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const announcements = await prisma.announcement.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 20,
  });

  return Response.json({ announcements });
}

export async function POST(req: NextRequest) {
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { guildDiscordId, title, content, pinned } = await req.json();
  const safeTitle = typeof title === "string" ? title.trim() : "";
  const safeContent = typeof content === "string" ? content.trim() : "";

  if (!safeTitle || !safeContent) {
    return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }

  const guild = await resolveWritableGuild(guildDiscordId);
  if (!guild) return Response.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const announcement = await prisma.announcement.create({
    data: {
      guildId: guild.id,
      title: safeTitle.slice(0, 80),
      content: safeContent.slice(0, 2000),
      authorId: session.user.id,
      pinned: !!pinned,
    },
  });

  return Response.json({ success: true, announcement });
}

export async function DELETE(req: NextRequest) {
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "공지 ID가 필요합니다." }, { status: 400 });

  const guild = await resolveWritableGuild();
  if (!guild) return Response.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const deleted = await prisma.announcement.deleteMany({
    where: { id, guildId: guild.id },
  });

  if (deleted.count === 0) {
    return Response.json({ error: "해당 공지를 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ success: true });
}
