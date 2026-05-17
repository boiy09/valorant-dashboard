import { getAdminSession } from "@/lib/admin";
import { graduateExpiredNewbies } from "@/lib/adminAutomation";
import { prisma } from "@/lib/prisma";

type DiscordRole = {
  id: string;
  name: string;
};

type DiscordGuildMember = {
  joined_at?: string | null;
  nick?: string | null;
  roles?: string[];
  user?: {
    id: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
};

function getDiscordAvatarUrl(user: NonNullable<DiscordGuildMember["user"]>) {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

async function syncDiscordMembers() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildDiscordId = process.env.DISCORD_GUILD_ID;

  if (!token || !guildDiscordId) {
    return {
      ok: false,
      status: 501,
      message: "DISCORD_BOT_TOKEN 또는 DISCORD_GUILD_ID 환경변수가 없습니다.",
    };
  }

  const DISCORD_TIMEOUT_MS = 10_000;

  async function discordFetch(url: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const discordApi = "https://discord.com/api/v10";
  const headers = { Authorization: `Bot ${token}` };
  const discordGuildResponse = await discordFetch(`${discordApi}/guilds/${guildDiscordId}`, { headers });
  if (!discordGuildResponse.ok) {
    return { ok: false, status: 502, message: `Discord 서버 정보 조회 실패 (${discordGuildResponse.status})` };
  }
  const discordGuild = await discordGuildResponse.json() as { name?: string };

  const rolesResponse = await discordFetch(`${discordApi}/guilds/${guildDiscordId}/roles`, { headers });
  if (!rolesResponse.ok) {
    return { ok: false, status: 502, message: `Discord 역할 조회 실패 (${rolesResponse.status})` };
  }
  const roles = await rolesResponse.json() as DiscordRole[];
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));

  const members: DiscordGuildMember[] = [];
  let after = "0";
  const MAX_PAGES = 20; // 최대 20,000명
  let page = 0;

  while (page < MAX_PAGES) {
    const params = new URLSearchParams({ limit: "1000", after });
    const membersResponse = await discordFetch(`${discordApi}/guilds/${guildDiscordId}/members?${params}`, { headers });
    if (!membersResponse.ok) {
      return { ok: false, status: 502, message: `Discord 멤버 조회 실패 (${membersResponse.status})` };
    }
    const batch = await membersResponse.json() as DiscordGuildMember[];

    members.push(...batch);
    page += 1;
    if (batch.length < 1000) break;

    const last = batch[batch.length - 1]?.user?.id;
    if (!last || last === after) break;
    after = last;
  }

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: { name: discordGuild.name ?? "Discord Server" },
    create: { discordId: guildDiscordId, name: discordGuild.name ?? "Discord Server" },
  });

  let synced = 0;
  for (const member of members) {
    if (!member.user || member.user.bot) continue;

    const displayName = member.nick ?? member.user.global_name ?? member.user.username ?? member.user.id;
    const email = `${member.user.id}@discord`;
    const user = await prisma.user.upsert({
      where: { discordId: member.user.id },
      update: {
        name: displayName,
        image: getDiscordAvatarUrl(member.user) ?? undefined,
      },
      create: {
        discordId: member.user.id,
        email,
        name: displayName,
        image: getDiscordAvatarUrl(member.user),
      },
    });

    const roleNames = (member.roles ?? [])
      .map((roleId) => roleNameById.get(roleId))
      .filter((roleName): roleName is string => Boolean(roleName) && roleName !== "@everyone")
      .join(",");
    const joinedAt = member.joined_at ? new Date(member.joined_at) : null;
    const validJoinedAt = joinedAt && !Number.isNaN(joinedAt.getTime()) ? joinedAt : undefined;

    await prisma.guildMember.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
      update: {
        roles: roleNames,
        nickname: member.nick ?? undefined,
        joinedAt: validJoinedAt,
      },
      create: {
        userId: user.id,
        guildId: guild.id,
        roles: roleNames,
        nickname: member.nick ?? undefined,
        joinedAt: validJoinedAt,
      },
    });
    synced += 1;
  }

  return { ok: true, status: 200, message: `${synced}명 멤버/역할 정보를 갱신했습니다.`, synced };
}

async function restartBot() {
  const restartUrl = process.env.BOT_RESTART_URL;
  if (!restartUrl) {
    return {
      ok: false,
      status: 501,
      message: "BOT_RESTART_URL 환경변수가 없어 웹에서 봇 재시작을 실행할 수 없습니다.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(restartUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.BOT_CONTROL_SECRET ? { Authorization: `Bearer ${process.env.BOT_CONTROL_SECRET}` } : {}),
      },
      body: JSON.stringify({ action: "restart" }),
    });
  } catch {
    return { ok: false, status: 502, message: "봇 재시작 요청 타임아웃 또는 연결 실패" };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { ok: false, status: 502, message: `봇 재시작 요청 실패 (${response.status})` };
  }

  return { ok: true, status: 200, message: "봇 재시작 요청을 보냈습니다." };
}

export async function POST(req: Request) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { action } = await req.json().catch(() => ({ action: null }));

  try {
    if (action === "sync-members") {
      const result = await syncDiscordMembers();
      return Response.json(result, { status: result.status });
    }

    if (action === "restart-bot") {
      const result = await restartBot();
      return Response.json(result, { status: result.status });
    }

    if (action === "graduate-newbies") {
      const result = await graduateExpiredNewbies();
      return Response.json(result, { status: result.status });
    }

    return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
