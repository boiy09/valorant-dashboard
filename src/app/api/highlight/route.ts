import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUser(session: any) {
  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "clip";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  const highlights = await prisma.highlight.findMany({
    where: { type },
    include: { user: { select: { name: true, image: true, discordId: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return Response.json({ highlights });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const user = await getUser(session);
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  const { title, description, url, type, guildDiscordId } = await req.json();
  if (!title?.trim() || !url?.trim()) return Response.json({ error: "제목과 URL을 입력해주세요." }, { status: 400 });

  const guild = guildDiscordId ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } }) : await prisma.guild.findFirst();
  if (!guild) return Response.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });

  const highlight = await prisma.highlight.create({
    data: { userId: user.id, guildId: guild.id, title, description, url, type: type ?? "clip" },
  });
  return Response.json({ success: true, highlight });
}

export async function PATCH(req: NextRequest) {
  const { highlightId } = await req.json();
  // 좋아요 증가
  await prisma.highlight.update({ where: { id: highlightId }, data: { likes: { increment: 1 } } });
  return Response.json({ success: true });
}
