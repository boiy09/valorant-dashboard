import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

function getDiscordHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return { Authorization: `Bot ${token}` };
}

async function fetchDiscordJson<T>(url: string): Promise<T | null> {
  const headers = getDiscordHeaders();
  if (!headers) return null;
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

function encodeReactionEmoji(reaction: { emoji?: { id?: string | null; name?: string | null } }) {
  const name = reaction.emoji?.name;
  if (!name) return null;
  return encodeURIComponent(reaction.emoji?.id ? `${name}:${reaction.emoji.id}` : name);
}

export async function POST(req: NextRequest) {
  const { session, guild } = await getAdminSession();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!guild) {
    return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { channelId, messageId, title } = body as {
    channelId?: string;
    messageId?: string;
    title?: string;
  };

  if (!channelId?.trim() || !messageId?.trim()) {
    return Response.json({ error: "채널 ID와 메시지 ID를 입력해 주세요." }, { status: 400 });
  }

  const headers = getDiscordHeaders();
  if (!headers) {
    return Response.json({ error: "Discord 봇 토큰이 설정되지 않았습니다." }, { status: 503 });
  }

  // fetch the Discord message to verify it exists and get reactions
  const message = await fetchDiscordJson<{
    id?: string;
    content?: string;
    reactions?: Array<{ count?: number; emoji?: { id?: string | null; name?: string | null } }>;
  }>(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`);

  if (!message) {
    return Response.json({ error: "Discord 메시지를 불러오지 못했습니다. 채널 ID와 메시지 ID를 확인해 주세요." }, { status: 400 });
  }

  // collect all unique reactors
  const reactorMap = new Map<string, {
    id: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  }>();

  for (const reaction of message.reactions ?? []) {
    if (!reaction.count || reaction.count <= 0) continue;
    const emoji = encodeReactionEmoji(reaction);
    if (!emoji) continue;

    const users = await fetchDiscordJson<
      Array<{ id: string; username?: string; global_name?: string | null; avatar?: string | null; bot?: boolean }>
    >(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}?limit=100`);

    for (const user of users ?? []) {
      if (!user.id || user.bot) continue;
      reactorMap.set(user.id, user);
    }
  }

  // create the scrim session
  const scrim = await prisma.scrimSession.create({
    data: {
      guildId: guild.id,
      title: title?.trim() || "불러온 내전",
      status: "waiting",
      createdBy: session.user.id,
      recruitmentChannelId: channelId.trim(),
      recruitmentMessageIds: JSON.stringify([messageId.trim()]),
    },
  });

  // upsert users and create scrim players
  const discordGuildId = guild.discordId;
  let joined = 0;

  for (const discordUser of reactorMap.values()) {
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const appUser = await prisma.user.upsert({
      where: { discordId: discordUser.id },
      update: {
        name: discordUser.global_name ?? discordUser.username ?? "Discord User",
        image: avatarUrl ?? undefined,
      },
      create: {
        discordId: discordUser.id,
        email: `${discordUser.id}@discord`,
        name: discordUser.global_name ?? discordUser.username ?? "Discord User",
        image: avatarUrl,
      },
    });

    await prisma.scrimPlayer.upsert({
      where: { sessionId_userId: { sessionId: scrim.id, userId: appUser.id } },
      update: {},
      create: {
        sessionId: scrim.id,
        userId: appUser.id,
        team: "participant",
        role: "participant",
      },
    });

    // sync guild member nickname
    if (discordGuildId) {
      const gm = await fetchDiscordJson<{ nick?: string | null }>(
        `https://discord.com/api/v10/guilds/${discordGuildId}/members/${discordUser.id}`
      );
      await prisma.guildMember.upsert({
        where: { userId_guildId: { userId: appUser.id, guildId: guild.id } },
        update: { nickname: gm?.nick ?? null },
        create: {
          userId: appUser.id,
          guildId: guild.id,
          nickname: gm?.nick ?? null,
        },
      });
    }

    joined++;
  }

  const created = await prisma.scrimSession.findUnique({
    where: { id: scrim.id },
    include: {
      players: {
        include: { user: { select: { name: true, image: true, riotGameName: true } } },
      },
    },
  });

  return Response.json({ success: true, scrim: created, joined });
}
