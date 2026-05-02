import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const guild = guildDiscordId ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } }) : await prisma.guild.findFirst();
  if (!guild) return Response.json({ applications: [] });

  const applications = await prisma.memberApplication.findMany({
    where: { guildId: guild.id, ...(status !== "all" ? { status } : {}) },
    include: { user: { select: { name: true, discordId: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({ applications });
}
