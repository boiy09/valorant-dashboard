import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();
  if (!guild) return Response.json({ applications: [] });

  const applications = await prisma.memberApplication.findMany({
    where: { guildId: guild.id, ...(status !== "all" ? { status } : {}) },
    include: { user: { select: { name: true, discordId: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({ applications });
}
