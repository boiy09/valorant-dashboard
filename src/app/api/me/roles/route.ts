import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ roles: [], isAdmin: false });

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return Response.json({ roles: [], isAdmin: false });

  const guild = await prisma.guild.findFirst();
  if (!guild) return Response.json({ roles: [], isAdmin: false });

  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: guild.id } },
  });

  const roles = member?.roles ? member.roles.split(",").filter(Boolean) : [];
  const isAdmin = roles.some(r => r === "관리자" || r === "어시스트");

  return Response.json({ roles, isAdmin });
}
