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
    bot?: boolean;
  };
};

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TIMEOUT_MS = 10_000;
const AUTO_COMPLAINT_WARNING_REASON = "민원 3건 누적으로 자동 부여된 경고";
const AUTO_COMPLAINT_WARNING_NOTE = "[AUTO_COMPLAINT_WARNING]";

function normalizeRole(role: string) {
  return role.replace(/\s/g, "").toLowerCase();
}

function hasRoleKeyword(role: string, keyword: string) {
  return normalizeRole(role).includes(normalizeRole(keyword));
}

function splitRoles(roles: string) {
  return roles.split(",").map((role) => role.trim()).filter(Boolean);
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

function getDiscordConfig() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildDiscordId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildDiscordId) return null;
  return {
    guildDiscordId,
    headers: { Authorization: `Bot ${token}` },
  };
}

async function getDiscordRoles() {
  const config = getDiscordConfig();
  if (!config) return null;

  const response = await discordFetch(`${DISCORD_API}/guilds/${config.guildDiscordId}/roles`, { headers: config.headers });
  if (!response.ok) throw new Error(`Discord 역할 조회 실패 (${response.status})`);
  return await response.json() as DiscordRole[];
}

function findRoleByKeyword(roles: DiscordRole[], keyword: string) {
  return roles.find((role) => hasRoleKeyword(role.name, keyword)) ?? null;
}

async function updateStoredRoles(memberId: string, currentRoleText: string, addRoles: DiscordRole[], removeKeywords: string[]) {
  const currentRoles = splitRoles(currentRoleText);
  const filtered = currentRoles.filter((role) => !removeKeywords.some((keyword) => hasRoleKeyword(role, keyword)));

  for (const role of addRoles) {
    if (!filtered.some((existing) => normalizeRole(existing) === normalizeRole(role.name))) {
      filtered.push(role.name);
    }
  }

  await prisma.guildMember.update({
    where: { id: memberId },
    data: { roles: filtered.join(",") },
  });
}

export async function syncUserWarningRoles(userId: string, guildId: string) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId, guildId } },
    include: { user: true },
  });
  if (!member?.user.discordId) return { ok: false, message: "Discord ID가 없어 역할을 동기화하지 않았습니다." };

  const warningRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Warning" WHERE "userId" = $1 AND "guildId" = $2 AND COALESCE(type, 'warning') = 'warning' AND active = true`,
    userId,
    guildId
  );
  const warningCount = Number(warningRows[0]?.count ?? 0);

  const roles = await getDiscordRoles();
  if (!roles) return { ok: false, message: "Discord 봇 환경변수가 없어 역할을 동기화하지 않았습니다." };

  const twoMealRole = findRoleByKeyword(roles, "두끼");
  const fastingRole = findRoleByKeyword(roles, "공복");
  const addRoles: DiscordRole[] = [];
  const removeRoles: DiscordRole[] = [];
  const removeKeywords: string[] = [];

  if (warningCount >= 2) {
    if (fastingRole) addRoles.push(fastingRole);
    if (twoMealRole) {
      removeRoles.push(twoMealRole);
      removeKeywords.push("두끼");
    }
  } else if (warningCount === 1) {
    if (twoMealRole) addRoles.push(twoMealRole);
    if (fastingRole) {
      removeRoles.push(fastingRole);
      removeKeywords.push("공복");
    }
  } else {
    if (twoMealRole) removeRoles.push(twoMealRole);
    if (fastingRole) removeRoles.push(fastingRole);
    removeKeywords.push("두끼", "공복");
  }

  const config = getDiscordConfig();
  if (!config) return { ok: false, message: "Discord 봇 환경변수가 없어 역할을 동기화하지 않았습니다." };

  for (const role of removeRoles) {
    await discordFetch(`${DISCORD_API}/guilds/${config.guildDiscordId}/members/${member.user.discordId}/roles/${role.id}`, {
      method: "DELETE",
      headers: config.headers,
    });
  }

  for (const role of addRoles) {
    await discordFetch(`${DISCORD_API}/guilds/${config.guildDiscordId}/members/${member.user.discordId}/roles/${role.id}`, {
      method: "PUT",
      headers: config.headers,
    });
  }

  await updateStoredRoles(member.id, member.roles, addRoles, removeKeywords);
  return { ok: true, warningCount };
}

export async function syncComplaintWarnings(userId: string, guildId: string) {
  const complaintRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Warning" WHERE "userId" = $1 AND "guildId" = $2 AND COALESCE(type, 'warning') = 'complaint' AND active = true`,
    userId,
    guildId
  );
  const complaintCount = Number(complaintRows[0]?.count ?? 0);
  const desiredAutoWarnings = Math.floor(complaintCount / 3);

  const autoWarnings = await prisma.$queryRawUnsafe<Array<{ id: string; active: boolean }>>(
    `SELECT id, active FROM "Warning" WHERE "userId" = $1 AND "guildId" = $2 AND COALESCE(type, 'warning') = 'warning' AND "issuedBy" = $3 AND reason = $4 AND note = $5 ORDER BY "createdAt" ASC`,
    userId,
    guildId,
    "봇",
    AUTO_COMPLAINT_WARNING_REASON,
    AUTO_COMPLAINT_WARNING_NOTE
  );

  const activeAutoWarnings = autoWarnings.filter((warning) => warning.active);
  if (activeAutoWarnings.length < desiredAutoWarnings) {
    const now = new Date();
    for (let i = activeAutoWarnings.length; i < desiredAutoWarnings; i += 1) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Warning" (id, "userId", "guildId", reason, note, "issuedBy", active, type, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, true, 'warning', $7, $7)`,
        `wrn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId,
        guildId,
        AUTO_COMPLAINT_WARNING_REASON,
        AUTO_COMPLAINT_WARNING_NOTE,
        "봇",
        now
      );
    }
  }

  if (activeAutoWarnings.length > desiredAutoWarnings) {
    const excess = activeAutoWarnings.slice(desiredAutoWarnings);
    for (const warning of excess) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Warning" SET active = false, "updatedAt" = $1 WHERE id = $2`,
        new Date(),
        warning.id
      );
    }
  }

  return syncUserWarningRoles(userId, guildId);
}

export async function syncWarningAutomation(userId: string, guildId: string) {
  return syncComplaintWarnings(userId, guildId);
}

export async function updateGuildMemberJoinDateFromDiscord(discordId: string, guildMemberId: string) {
  const config = getDiscordConfig();
  if (!config) return null;

  const response = await discordFetch(`${DISCORD_API}/guilds/${config.guildDiscordId}/members/${discordId}`, { headers: config.headers });
  if (!response.ok) return null;

  const member = await response.json() as DiscordGuildMember;
  if (!member.joined_at) return null;

  const joinedAt = new Date(member.joined_at);
  if (Number.isNaN(joinedAt.getTime())) return null;

  await prisma.guildMember.update({
    where: { id: guildMemberId },
    data: { joinedAt },
  });
  return joinedAt;
}

export async function graduateExpiredNewbies() {
  const config = getDiscordConfig();
  if (!config) return { ok: false, status: 501, message: "DISCORD_BOT_TOKEN 또는 DISCORD_GUILD_ID 환경변수가 없습니다.", graduated: 0 };

  const guild = await prisma.guild.findUnique({ where: { discordId: config.guildDiscordId } });
  if (!guild) return { ok: false, status: 404, message: "서버 정보를 찾지 못했습니다.", graduated: 0 };

  const roles = await getDiscordRoles();
  if (!roles) return { ok: false, status: 501, message: "Discord 역할을 조회할 수 없습니다.", graduated: 0 };

  const newbieRole = findRoleByKeyword(roles, "신입");
  if (!newbieRole) return { ok: false, status: 404, message: "Discord 서버에서 신입 역할을 찾지 못했습니다.", graduated: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const members = await prisma.guildMember.findMany({
    where: { guildId: guild.id },
    include: { user: true },
  });

  let graduated = 0;
  for (const member of members) {
    if (!member.user.discordId || !splitRoles(member.roles).some((role) => hasRoleKeyword(role, "신입"))) continue;
    const joinedAt = await updateGuildMemberJoinDateFromDiscord(member.user.discordId, member.id) ?? member.joinedAt;
    if (joinedAt > cutoff) continue;

    await discordFetch(`${DISCORD_API}/guilds/${config.guildDiscordId}/members/${member.user.discordId}/roles/${newbieRole.id}`, {
      method: "DELETE",
      headers: config.headers,
    });
    await updateStoredRoles(member.id, member.roles, [], ["신입"]);
    graduated += 1;
  }

  return { ok: true, status: 200, message: `서버 가입 30일 경과 신입 ${graduated}명을 졸업 처리했습니다.`, graduated };
}
