import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type DiscordRole = {
  id: string;
  name: string;
};

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TIMEOUT_MS = 10_000;

function normalizeRole(role: string) {
  return role.replace(/\s/g, "").toLowerCase();
}

function splitRoles(roles: string) {
  return roles.split(",").map((role) => role.trim()).filter(Boolean);
}

function hasRoleKeyword(role: string, keyword: string) {
  return normalizeRole(role).includes(normalizeRole(keyword));
}

function getGraduationRole(roles: string[]) {
  const probationRole = roles.find((role) => hasRoleKeyword(role, "웰컴수습"));
  if (probationRole) return probationRole;
  return roles.find((role) => hasRoleKeyword(role, "신입")) ?? null;
}

async function discordFetch(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const { isAdmin, guild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾지 못했습니다." }, { status: 404 });

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildDiscordId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildDiscordId) {
    return Response.json({ error: "DISCORD_BOT_TOKEN 또는 DISCORD_GUILD_ID 환경변수가 없습니다." }, { status: 501 });
  }

  const { discordId } = await req.json().catch(() => ({ discordId: null }));
  if (!discordId || typeof discordId !== "string") {
    return Response.json({ error: "졸업 처리할 Discord ID가 필요합니다." }, { status: 400 });
  }

  const member = await prisma.guildMember.findFirst({
    where: {
      guildId: guild.id,
      user: { discordId },
    },
    include: { user: true },
  });

  const currentRoles = splitRoles(member?.roles ?? "");
  const targetRoleName = getGraduationRole(currentRoles);
  if (!targetRoleName) {
    return Response.json({ error: "현재 저장된 역할에 웰컴 수습 또는 신입이 없습니다. 멤버 동기화 후 다시 시도해 주세요." }, { status: 409 });
  }

  const headers = { Authorization: `Bot ${token}` };
  const rolesResponse = await discordFetch(`${DISCORD_API}/guilds/${guildDiscordId}/roles`, { headers });
  if (!rolesResponse.ok) {
    return Response.json({ error: `Discord 역할 조회 실패 (${rolesResponse.status})` }, { status: 502 });
  }

  const discordRoles = await rolesResponse.json() as DiscordRole[];
  const targetDiscordRole = discordRoles.find((role) => normalizeRole(role.name) === normalizeRole(targetRoleName))
    ?? discordRoles.find((role) => hasRoleKeyword(role.name, targetRoleName))
    ?? discordRoles.find((role) => hasRoleKeyword(targetRoleName, role.name));
  if (!targetDiscordRole) {
    return Response.json({ error: `Discord 서버에서 '${targetRoleName}' 역할을 찾지 못했습니다.` }, { status: 404 });
  }

  const removeResponse = await discordFetch(`${DISCORD_API}/guilds/${guildDiscordId}/members/${discordId}/roles/${targetDiscordRole.id}`, {
    method: "DELETE",
    headers,
  });

  if (!removeResponse.ok && removeResponse.status !== 404) {
    return Response.json({ error: `Discord 역할 제거 실패 (${removeResponse.status})` }, { status: 502 });
  }

  if (member) {
    const nextRoles = currentRoles.filter((role) => normalizeRole(role) !== normalizeRole(targetRoleName)).join(",");
    await prisma.guildMember.update({
      where: { id: member.id },
      data: { roles: nextRoles },
    });
  }

  return Response.json({
    ok: true,
    removedRole: targetRoleName,
    message: `${member?.nickname ?? member?.user.name ?? "대상자"}님의 ${targetRoleName} 역할을 제거했습니다.`,
  });
}
