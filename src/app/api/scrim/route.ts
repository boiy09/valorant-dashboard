import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10");

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const sessions = await prisma.scrimSession.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      players: {
        include: { user: { select: { name: true, image: true, riotGameName: true } } },
      },
    },
  });

  return Response.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { guildDiscordId, title, result, map, teamA, teamB } = await req.json();

  const guild = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
  if (!guild) return Response.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });

  const scrim = await prisma.scrimSession.create({
    data: {
      guildId: guild.id,
      title: title ?? "내전",
      status: "done",
      map,
      winnerId: result,
      createdBy: session.user.id,
      startedAt: null,
      endedAt: null,
    },
  });

  return Response.json({ success: true, scrimId: scrim.id });
}
