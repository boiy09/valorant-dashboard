import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const guildDiscordId = req.nextUrl.searchParams.get("guildId") ?? process.env.DISCORD_GUILD_ID;
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) return Response.json({ members: [], guildName: null });

  const members = await prisma.guildMember.findMany({
    where: { guildId: guild.id },
    include: {
      user: {
        select: {
          name: true,
          image: true,
          discordId: true,
          riotGameName: true,
          riotTagLine: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return Response.json({
    guildName: guild.name,
    members: members.map((member) => ({
      id: member.id,
      name: member.nickname ?? member.user.name,
      image: member.user.image,
      discordId: member.user.discordId,
      roles: member.roles ? member.roles.split(",").filter(Boolean) : [],
      riotId: member.user.riotGameName
        ? `${member.user.riotGameName}#${member.user.riotTagLine}`
        : null,
      isOnline: member.isOnline,
      joinedAt: member.joinedAt,
    })),
  });
}
