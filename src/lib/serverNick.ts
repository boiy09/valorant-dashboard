/**
 * 발로세끼 서버 닉네임 유틸
 * user.name(Discord 글로벌 닉네임) 대신 GuildMember.nickname(서버 닉네임)을 우선 반환
 */
import { prisma } from "@/lib/prisma";

let cachedGuildId: string | null = null;

async function getGuildId(): Promise<string | null> {
  if (cachedGuildId) return cachedGuildId;
  const guild = await prisma.guild.findFirst({ select: { id: true } });
  if (guild) cachedGuildId = guild.id;
  return cachedGuildId;
}

/**
 * userId 배열을 받아 { userId -> serverNickname } 맵을 반환
 * GuildMember.nickname이 없으면 User.name 폴백
 */
export async function getServerNicknames(userIds: string[]): Promise<Map<string, string>> {
  const guildId = await getGuildId();
  const map = new Map<string, string>();
  if (!guildId || userIds.length === 0) return map;

  const members = await prisma.guildMember.findMany({
    where: { guildId, userId: { in: userIds } },
    select: { userId: true, nickname: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });

  const userNameMap = new Map(users.map((u) => [u.id, u.name ?? ""]));
  const memberMap = new Map(members.map((m) => [m.userId, m.nickname ?? ""]));

  for (const uid of userIds) {
    const serverNick = memberMap.get(uid);
    map.set(uid, serverNick || userNameMap.get(uid) || "");
  }

  return map;
}

/**
 * 단일 userId의 서버 닉네임 반환
 */
export async function getServerNickname(userId: string): Promise<string> {
  const map = await getServerNicknames([userId]);
  return map.get(userId) ?? "";
}

/**
 * User 객체에 guildMember.nickname을 포함시키는 Prisma include 헬퍼
 * 사용: include: { ...userWithServerNick() }
 */
export function userSelectWithGuildMember() {
  return {
    id: true,
    discordId: true,
    name: true,
    image: true,
    riotAccounts: {
      select: {
        gameName: true,
        tagLine: true,
        region: true,
        cachedTierName: true,
        cachedCard: true,
        cachedLevel: true,
      },
    },
    valorantRole: true,
    favoriteAgents: true,
    guildMembers: {
      select: {
        nickname: true,
        guildId: true,
      },
    },
  } as const;
}

/**
 * user 객체에서 발로세끼 서버 닉네임 추출 (guildMembers 포함된 경우)
 */
export function resolveServerNick(
  user: {
    name?: string | null;
    guildMembers?: Array<{ nickname: string | null; guildId: string }>;
  },
  guildId?: string | null
): string {
  if (user.guildMembers && user.guildMembers.length > 0) {
    const member = guildId
      ? user.guildMembers.find((m) => m.guildId === guildId)
      : user.guildMembers[0];
    if (member?.nickname) return member.nickname;
  }
  return user.name ?? "";
}
