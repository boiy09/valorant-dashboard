import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUser(session: any) {
  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "sale";
  const category = req.nextUrl.searchParams.get("category");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  const posts = await prisma.marketPost.findMany({
    where: { status, ...(category ? { category } : {}) },
    include: { user: { select: { name: true, discordId: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return Response.json({ posts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const user = await getUser(session);
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  const { title, description, price, category, imageUrl, guildDiscordId } = await req.json();
  if (!title?.trim() || !description?.trim()) return Response.json({ error: "제목과 설명을 입력해주세요." }, { status: 400 });

  const guild = guildDiscordId ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } }) : await prisma.guild.findFirst();
  if (!guild) return Response.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });

  const post = await prisma.marketPost.create({
    data: { userId: user.id, guildId: guild.id, title, description, price: price ? parseInt(price) : null, category: category ?? "기타", imageUrl },
  });
  return Response.json({ success: true, post });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const user = await getUser(session);
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  const { postId, status } = await req.json();
  const post = await prisma.marketPost.findUnique({ where: { id: postId } });
  if (!post || post.userId !== user.id) return Response.json({ error: "권한이 없어요." }, { status: 403 });

  await prisma.marketPost.update({ where: { id: postId }, data: { status, updatedAt: new Date() } });
  return Response.json({ success: true });
}
