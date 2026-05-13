import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 100);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const announcements = await prisma.announcement.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return Response.json({ announcements });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { guildDiscordId, title, content, pinned } = await req.json();
  if (!title?.trim() || !content?.trim()) {
    return Response.json({ error: "제목과 내용을 입력해주세요." }, { status: 400 });
  }

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;
  if (!guild) return Response.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });

  // 작성자가 해당 길드 멤버인지 확인
  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  if (!user) return Response.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 });

  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: guild.id } },
  });
  if (!member) return Response.json({ error: "해당 서버의 멤버가 아닙니다." }, { status: 403 });

  const announcement = await prisma.announcement.create({
    data: {
      guildId: guild.id,
      title,
      content,
      authorId: user.id,
      pinned: !!pinned,
    },
  });

  return Response.json({ success: true, announcement });
}
