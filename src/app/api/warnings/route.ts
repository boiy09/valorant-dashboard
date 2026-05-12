import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const warnings = await prisma.warning.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
    include: {
      user: {
        select: {
          name: true,
          image: true,
          guilds: { select: { nickname: true }, take: 1 },
        },
      },
    },
  });

  return Response.json({
    warnings: warnings.map((w) => ({
      ...w,
      user: {
        ...w.user,
        name: w.user.guilds[0]?.nickname ?? w.user.name,
      },
    })),
  });
}
