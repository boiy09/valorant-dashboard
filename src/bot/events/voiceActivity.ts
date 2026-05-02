import { Events, VoiceState } from "discord.js";
import type { BotClient } from "../index";
import { prisma } from "../../lib/prisma";

// userId -> VoiceActivity record id (현재 음성채널에 있는 유저 추적)
const activeSessions = new Map<string, string>();

async function getOrCreateUser(discordId: string, name: string) {
  const email = `${discordId}@discord`;
  return prisma.user.upsert({
    where: { discordId },
    update: {},
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

export function registerVoiceEvents(client: BotClient) {
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const discordUserId = newState.member?.id ?? oldState.member?.id;
    if (!discordUserId) return;
    // 봇 제외
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const guildDiscordId = newState.guild?.id ?? oldState.guild?.id;
    const guildName = newState.guild?.name ?? oldState.guild?.name ?? "Unknown";
    const memberName = newState.member?.displayName ?? oldState.member?.displayName ?? "Unknown";

    const sessionKey = `${discordUserId}_${guildDiscordId}`;

    try {
      // 채널 입장
      if (!oldState.channelId && newState.channelId) {
        const [user, guild] = await Promise.all([
          getOrCreateUser(discordUserId, memberName),
          getOrCreateGuild(guildDiscordId, guildName),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        await prisma.dailyAttendance.upsert({
          where: { userId_guildId_date: { userId: user.id, guildId: guild.id, date: today } },
          update: {},
          create: { userId: user.id, guildId: guild.id, date: today },
        });

        const activity = await prisma.voiceActivity.create({
          data: {
            userId: user.id,
            guildId: guild.id,
            channelId: newState.channelId,
            channelName: newState.channel?.name ?? "Unknown",
          },
        });
        activeSessions.set(sessionKey, activity.id);
      }

      // 채널 퇴장
      else if (oldState.channelId && !newState.channelId) {
        const activityId = activeSessions.get(sessionKey);
        if (activityId) {
          const now = new Date();
          const activity = await prisma.voiceActivity.findUnique({ where: { id: activityId } });
          if (activity) {
            const duration = Math.floor((now.getTime() - activity.joinedAt.getTime()) / 1000);
            await prisma.voiceActivity.update({
              where: { id: activityId },
              data: { leftAt: now, duration },
            });
          }
          activeSessions.delete(sessionKey);
        }
      }

      // 채널 이동 — 이전 세션 종료 후 새 세션 시작
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const activityId = activeSessions.get(sessionKey);
        if (activityId) {
          const now = new Date();
          const activity = await prisma.voiceActivity.findUnique({ where: { id: activityId } });
          if (activity) {
            const duration = Math.floor((now.getTime() - activity.joinedAt.getTime()) / 1000);
            await prisma.voiceActivity.update({
              where: { id: activityId },
              data: { leftAt: now, duration },
            });
          }
        }
        const [user, guild] = await Promise.all([
          getOrCreateUser(discordUserId, memberName),
          getOrCreateGuild(guildDiscordId, guildName),
        ]);
        const newActivity = await prisma.voiceActivity.create({
          data: {
            userId: user.id,
            guildId: guild.id,
            channelId: newState.channelId,
            channelName: newState.channel?.name ?? "Unknown",
          },
        });
        activeSessions.set(sessionKey, newActivity.id);
      }
    } catch (e) {
      console.error("VoiceActivity error:", e);
    }
  });
}
