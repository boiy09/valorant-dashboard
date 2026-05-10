import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLE_KEYWORDS = ["관리자", "admin", "administrator", "운영진", "운영자"];
const VALONEKKI_ROLE_KEYWORDS = ["발로네끼"];

function normalizeRole(role: string) {
  return role.trim().toLowerCase().replace(/\s+/g, "");
}

function hasKeywordMatch(roles: string[], keywords: string[]) {
  const normalizedRoles = roles.map(normalizeRole);
  const normalizedKeywords = keywords.map(normalizeRole);
  return normalizedRoles.some((role) => normalizedKeywords.some((keyword) => role.includes(keyword)));
}

export function hasPrivilegedRole(roles: string[]) {
  return hasKeywordMatch(roles, ADMIN_ROLE_KEYWORDS) || hasKeywordMatch(roles, VALONEKKI_ROLE_KEYWORDS);
}

export async function getAdminSession() {
  const session = await auth();
  if (!session?.user?.id) return { session: null, user: null, guild: null, roles: [], isAdmin: false };

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  if (!user) return { session, user: null, guild: null, roles: [], isAdmin: false };

  const guild = await prisma.guild.findFirst();
  if (!guild) return { session, user, guild: null, roles: [], isAdmin: false };

  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: guild.id } },
  });

  const roles = member?.roles ? member.roles.split(",").map((role) => role.trim()).filter(Boolean) : [];
  const isAdmin = hasPrivilegedRole(roles);

  return { session, user, guild, roles, isAdmin };
}
