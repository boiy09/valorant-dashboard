import { Events, GuildMember, VoiceBasedChannel, VoiceState } from "discord.js";
import type { BotClient } from "../index";
import { prisma } from "../../lib/prisma";

const activeSessions = new Map<string, string>();
const EXCLUDED_CHANNEL_KEYWORDS = ["잠수", "afk"];

function isExcludedVoiceChannel(channelName: string) {
  const normalized = channelName.toLowerCase().replace(/\s/g, "");
  return EXCLUDED_CHANNEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function getOrCreateUser(discordId: string, name: string) {
  const email = `${discordId}@discord`;
  return prisma.user.upsert({
    where: { discordId },
    update: { name },
    create: { discordId, email, name },
  });
}

async function getOrCreateGuild(guildId: string, guildName: string) {
  return prisma.guild.upsert({
    where: { discordId: guildId },
    update: { name: guildName },
    create: { discordId: guildId, name: guildName },
  });
}

function getSessionKey(discordUserId: string, guildDiscordId: string) {
  return `${discordUserId}_${guildDiscordId}`;
}

async function ensureDailyAttendance(userId: string, guildId: string) {
  const today = new Date().toISOString().slice(0, 10);
  await prisma.dailyAttendance.upsert({
    where: { userId_guildId_date: { userId, guildId, date: today } },
    update: {},
    create: { userId, guildId, date: today },
  });
}

async function openSessionForMember(member: GuildMember, channel: VoiceBasedChannel) {
  if (member.user.bot) return;
  if (isExcludedVoiceChannel(channel.name)) return;

  const [user, guild] = await Promise.all([
    getOrCreateUser(member.id, member.displayName),
    getOrCreateGuild(member.guild.id, member.guild.name),
  ]);

  await ensureDailyAttendance(user.id, guild.id);

  const existingOpenActivities = await prisma.voiceActivity.findMany({
    where: {
      userId: user.id,
      guildId: guild.id,
      leftAt: null,
    },
    orderBy: { joinedAt: "desc" },
  });
  const [existingOpen, ...duplicateOpenActivities] = existingOpenActivities;

  if (existingOpen) {
    await Promise.all(duplicateOpenActivities.map((activity) => closeSession(activity.id)));

    if (existingOpen.channelId !== channel.id || existingOpen.channelName !== channel.name) {
      await prisma.voiceActivity.update({
        where: { id: existingOpen.id },
        data: {
          channelId: channel.id,
          channelName: channel.name,
        },
      });
    }
    activeSessions.set(getSessionKey(member.id, member.guild.id), existingOpen.id);
    return;
  }

  const activity = await prisma.voiceActivity.create({
    data: {
      userId: user.id,
      guildId: guild.id,
      channelId: channel.id,
      channelName: channel.name,
    },
  });
  activeSessions.set(getSessionKey(member.id, member.guild.id), activity.id);
}

async function closeSession(sessionId: string) {
  const now = new Date();
  const activity = await prisma.voiceActivity.findUnique({ where: { id: sessionId } });
  if (!activity || activity.leftAt) return;

  const duration = Math.floor((now.getTime() - activity.joinedAt.getTime()) / 1000);
  await prisma.voiceActivity.update({
    where: { id: sessionId },
    data: { leftAt: now, duration },
  });
}

async function hydrateVoiceSessions(client: BotClient) {
  const openActivities = await prisma.voiceActivity.findMany({
    where: { leftAt: null },
    include: { user: true, guild: true },
  });

  for (const activity of openActivities) {
    const guild = client.guilds.cache.get(activity.guild.discordId);
    const member = guild?.members.cache.get(activity.user.discordId ?? "");
    const currentChannelId = member?.voice.channelId ?? null;
    const sessionKey =
      activity.user.discordId && guild ? getSessionKey(activity.user.discordId, guild.id) : null;

    if (guild && member && currentChannelId === activity.channelId) {
      if (sessionKey && activeSessions.has(sessionKey)) {
        await closeSession(activity.id);
        continue;
      }

      activeSessions.set(getSessionKey(member.id, guild.id), activity.id);
      continue;
    }

    await closeSession(activity.id);
  }

  for (const [, guild] of client.guilds.cache) {
    await guild.members.fetch();
    for (const [, member] of guild.members.cache) {
      const channel = member.voice.channel;
      if (!channel || member.user.bot) continue;
      if (isExcludedVoiceChannel(channel.name)) continue;
      await openSessionForMember(member, channel);
    }
  }

  console.log(`음성 활동 세션 복구 완료: ${activeSessions.size}개 활성 세션`);
}

export function registerVoiceEvents(client: BotClient) {
  client.once(Events.ClientReady, async () => {
    try {
      await hydrateVoiceSessions(client);
    } catch (error) {
      console.error("음성 활동 세션 복구 오류:", error);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const discordUserId = newState.member?.id ?? oldState.member?.id;
    if (!discordUserId) return;
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const guildDiscordId = newState.guild?.id ?? oldState.guild?.id;
    const guildName = newState.guild?.name ?? oldState.guild?.name ?? "Unknown";
    const memberName = newState.member?.displayName ?? oldState.member?.displayName ?? "Unknown";

    if (!guildDiscordId) return;
    const sessionKey = getSessionKey(discordUserId, guildDiscordId);

    try {
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;
      const oldIncluded = Boolean(oldChannel && !isExcludedVoiceChannel(oldChannel.name));
      const newIncluded = Boolean(newChannel && !isExcludedVoiceChannel(newChannel.name));

      if (!oldIncluded && newIncluded) {
        await openSessionForMember(newState.member!, newState.channel!);
      } else if (oldIncluded && !newIncluded) {
        const activityId = activeSessions.get(sessionKey);
        if (activityId) {
          await closeSession(activityId);
          activeSessions.delete(sessionKey);
        }
      } else if (oldIncluded && newIncluded && oldState.channelId !== newState.channelId) {
        const activityId = activeSessions.get(sessionKey);
        if (activityId) {
          await closeSession(activityId);
        }
        await openSessionForMember(newState.member!, newState.channel!);
      }
    } catch (error) {
      console.error(
        `VoiceActivity 오류 [guild:${guildDiscordId} user:${discordUserId} channel:${newState.channelId ?? oldState.channelId ?? "none"} member:${memberName} guildName:${guildName}]`,
        error
      );
    }
  });
}
