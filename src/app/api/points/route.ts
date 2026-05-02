import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "ranking";
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");

  const guild = guildDiscordId ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } }) : await prisma.guild.findFirst();
  if (!guild) return Response.json({ ranking: [], total: 0 });

  if (type === "ranking") {
    const txs = await prisma.pointTransaction.groupBy({
      by: ["userId"],
      where: { guildId: guild.id },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 20,
    });
    const users = await Promise.all(txs.map(t => prisma.user.findUnique({ where: { id: t.userId }, select: { name: true, discordId: true, image: true } })));
    const ranking = txs.map((t, i) => ({ rank: i + 1, user: users[i], points: t._sum.amount ?? 0 }));
    return Response.json({ ranking });
  }

  if (type === "me") {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
    if (!user && session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return Response.json({ total: 0, history: [] });

    const result = await prisma.pointTransaction.aggregate({ where: { userId: user.id, guildId: guild.id }, _sum: { amount: true } });
    const history = await prisma.pointTransaction.findMany({ where: { userId: user.id, guildId: guild.id }, orderBy: { createdAt: "desc" }, take: 20 });
    return Response.json({ total: result._sum.amount ?? 0, history });
  }

  return Response.json({ error: "unknown type" }, { status: 400 });
}
