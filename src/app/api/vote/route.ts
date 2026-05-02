import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const guild = guildDiscordId ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } }) : null;

  const votes = await prisma.vote.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    include: { options: { include: { responses: true } }, responses: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return Response.json({
    votes: votes.map(v => ({
      id: v.id,
      title: v.title,
      endsAt: v.endsAt,
      active: v.endsAt > new Date(),
      total: v.responses.length,
      options: v.options.map(o => ({ id: o.id, label: o.label, count: o.responses.length })),
    })),
  });
}
