import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const warnings = await prisma.warning.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, image: true } },
    },
  });

  return Response.json({ warnings });
}
