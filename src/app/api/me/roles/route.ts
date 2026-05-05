import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const ASSIST_ROLE_KEYWORDS = ["어시스트", "assistant", "assist", "staff", "스태프", "매니저"];

function normalizeRole(role: string) {
  return role.trim().toLowerCase();
}

function hasKeywordMatch(roles: string[], keywords: string[]) {
  const normalizedRoles = roles.map(normalizeRole);
  return normalizedRoles.some((role) =>
    keywords.some((keyword) => role.includes(keyword.toLowerCase()))
  );
}

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ roles: [], isAdmin: false });

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  if (!user) return Response.json({ roles: [], isAdmin: false });

  const guild = await prisma.guild.findFirst();
  if (!guild) return Response.json({ roles: [], isAdmin: false });

  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: guild.id } },
  });

  const roles = member?.roles ? member.roles.split(",").map((role) => role.trim()).filter(Boolean) : [];
  const isAdmin =
    hasKeywordMatch(roles, ADMIN_ROLE_KEYWORDS) || hasKeywordMatch(roles, ASSIST_ROLE_KEYWORDS);

  return Response.json({ roles, isAdmin });
}
