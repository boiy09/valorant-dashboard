import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_KEYWORDS  = (process.env.DISCORD_ADMIN_ROLES  ?? "관리자").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ASSIST_KEYWORDS = (process.env.DISCORD_ASSIST_ROLES ?? "어시스트").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function getRoleCategory(rolesStr: string): "관리자" | "어시스트" | "일반" {
  const roles = rolesStr.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
  if (roles.some(r => ADMIN_KEYWORDS.some(k => r.includes(k))))  return "관리자";
  if (roles.some(r => ASSIST_KEYWORDS.some(k => r.includes(k)))) return "어시스트";
  return "일반";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId")
    ?? process.env.DISCORD_GUILD_ID;
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) return Response.json({ members: [], guildName: null });

  const members = await prisma.guildMember.findMany({
    where: { guildId: guild.id },
    include: {
      user: { select: { name: true, image: true, discordId: true, riotGameName: true, riotTagLine: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  // 디버그: DB에 저장된 역할명 전체 목록 (개발 환경에서만)
  const allRoleNames = [...new Set(
    members.flatMap(m => m.roles ? m.roles.split(",").map(r => r.trim()).filter(Boolean) : [])
  )];

  return Response.json({
    guildName: guild.name,
    _roleNames: process.env.NODE_ENV !== "production" ? allRoleNames : undefined,
    members: members.map(m => ({
      id: m.id,
      name: m.nickname ?? m.user.name,
      image: m.user.image,
      discordId: m.user.discordId,
      roles: m.roles ? m.roles.split(",").map(r => r.trim()).filter(Boolean) : [],
      roleCategory: getRoleCategory(m.roles ?? ""),
      riotId: m.user.riotGameName ? `${m.user.riotGameName}#${m.user.riotTagLine}` : null,
      isOnline: m.isOnline,
      joinedAt: m.joinedAt,
    })),
  });
}
