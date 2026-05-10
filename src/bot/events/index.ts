import { Events, MessageFlags } from "discord.js";
import type { Guild, InteractionReplyOptions } from "discord.js";
import type { BotClient } from "../index";
import { prisma } from "../../lib/prisma";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];
const VIDEO_URL_PATTERN = /https?:\/\/\S+\.(?:mp4|mov|webm|mkv|avi)(?:\?\S*)?/gi;
const MAX_VOICE_SESSION_SECONDS = 18 * 60 * 60;

function isVideoAttachment(name: string, contentType: string | null | undefined) {
  const lowerName = name.toLowerCase();
  return (
    contentType?.startsWith("video/") ||
    VIDEO_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
}

async function fetchGuildMembersSafely(guild: Guild) {
  try {
    return await guild.members.fetch();
  } catch (error) {
    console.error(`멤버 전체 조회 제한 [${guild.name}]: 캐시된 멤버로 동기화를 진행합니다.`, error);
    return guild.members.cache;
  }
}

async function deleteHighlightsByDiscordMessage(guildDiscordId: string | null | undefined, messageId: string) {
  if (!guildDiscordId || !messageId) return 0;

  const guild = await prisma.guild.findUnique({
    where: { discordId: guildDiscordId },
    select: { id: true },
  });
  if (!guild) return 0;

  const result = await prisma.highlight.deleteMany({
    where: {
      guildId: guild.id,
      description: {
        contains: `/${messageId}`,
      },
    },
  });

  return result.count;
}

export function registerEvents(client: BotClient) {
  client.once(Events.ClientReady, async (discordClient) => {
    console.log(`봇 온라인: ${discordClient.user.tag}`);

    for (const [, guild] of discordClient.guilds.cache) {
      try {
        const dbGuild = await prisma.guild.upsert({
          where: { discordId: guild.id },
          update: { name: guild.name },
          create: { discordId: guild.id, name: guild.name },
        });

        const members = await fetchGuildMembersSafely(guild);
        const syncedUserIds: string[] = [];
        for (const [, member] of members) {
          if (member.user.bot) continue;

          const email = `${member.user.id}@discord`;
          const user = await prisma.user.upsert({
            where: { discordId: member.user.id },
            update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
            create: {
              discordId: member.user.id,
              email,
              name: member.user.displayName,
              image: member.user.displayAvatarURL(),
            },
          });
          syncedUserIds.push(user.id);

          const roles = member.roles.cache
            .filter((role) => role.name !== "@everyone")
            .map((role) => role.name)
            .join(",");

          await prisma.guildMember.upsert({
            where: { userId_guildId: { userId: user.id, guildId: dbGuild.id } },
            update: { roles, nickname: member.nickname ?? undefined },
            create: { userId: user.id, guildId: dbGuild.id, roles, nickname: member.nickname ?? undefined },
          });
        }

        if (syncedUserIds.length > 0) {
          const removed = await prisma.guildMember.deleteMany({
            where: {
              guildId: dbGuild.id,
              userId: { notIn: syncedUserIds },
            },
          });
          if (removed.count > 0) {
            console.log(`탈퇴 멤버 정리 완료: ${guild.name} (${removed.count}명)`);
          }
        }

        await prisma.guildMember.updateMany({ where: { guildId: dbGuild.id }, data: { isOnline: false } });
        for (const [, presence] of guild.presences.cache) {
          if (!presence.userId || presence.status === "offline" || presence.status === "invisible") continue;

          const user = await prisma.user.findUnique({ where: { discordId: presence.userId } });
          if (!user) continue;

          await prisma.guildMember.updateMany({
            where: { userId: user.id, guildId: dbGuild.id },
            data: { isOnline: true },
          });
        }

        console.log(`멤버 동기화 완료: ${guild.name} (${members.size}명)`);
      } catch (error) {
        console.error(`멤버 동기화 오류 [${guild.name}]:`, error);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`명령어 오류 [${interaction.commandName}]:`, error);
      const message: InteractionReplyOptions = {
        content: "명령어 실행 중 오류가 발생했습니다.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(message);
      } else {
        await interaction.reply(message);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    try {
      const guild = await prisma.guild.findUnique({
        where: { discordId: message.guild.id },
      });
      if (!guild?.highlightChannelId || guild.highlightChannelId !== message.channelId) return;

      const attachments = [...message.attachments.values()]
        .filter((attachment) => isVideoAttachment(attachment.name, attachment.contentType))
        .map((attachment) => ({
          title: attachment.name || "Discord clip",
          url: attachment.url,
        }));

      const linkedVideos = [...message.content.matchAll(VIDEO_URL_PATTERN)].map((match) => ({
        title: message.cleanContent.trim().slice(0, 80) || "Discord clip",
        url: match[0],
      }));

      const videos = [...attachments, ...linkedVideos];
      if (!videos.length) return;

      const email = `${message.author.id}@discord`;
      const user = await prisma.user.upsert({
        where: { discordId: message.author.id },
        update: {
          name: message.member?.displayName ?? message.author.displayName,
          image: message.author.displayAvatarURL(),
        },
        create: {
          discordId: message.author.id,
          email,
          name: message.member?.displayName ?? message.author.displayName,
          image: message.author.displayAvatarURL(),
        },
      });

      for (const video of videos) {
        const exists = await prisma.highlight.findFirst({
          where: { guildId: guild.id, url: video.url },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.highlight.create({
          data: {
            userId: user.id,
            guildId: guild.id,
            title: video.title,
            description: message.url,
            url: video.url,
            type: "clip",
          },
        });
      }
    } catch (error) {
      console.error("하이라이트 자동 등록 오류:", error);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      const deletedCount = await deleteHighlightsByDiscordMessage(message.guildId, message.id);
      if (deletedCount > 0) {
        console.log(`하이라이트 자동 삭제: Discord 메시지 ${message.id} (${deletedCount}개)`);
      }
    } catch (error) {
      console.error("하이라이트 자동 삭제 오류:", error);
    }
  });

  client.on(Events.MessageBulkDelete, async (messages) => {
    for (const [, message] of messages) {
      try {
        const deletedCount = await deleteHighlightsByDiscordMessage(message.guildId, message.id);
        if (deletedCount > 0) {
          console.log(`하이라이트 자동 일괄 삭제: Discord 메시지 ${message.id} (${deletedCount}개)`);
        }
      } catch (error) {
        console.error("하이라이트 자동 일괄 삭제 오류:", error);
      }
    }
  });

  client.on(Events.Raw, async (packet) => {
    if (packet.t === "MESSAGE_DELETE") {
      await deleteHighlightsByDiscordMessage(packet.d.guild_id, packet.d.id).catch((error) => {
        console.error("하이라이트 raw 삭제 이벤트 처리 오류:", error);
      });
    }

    if (packet.t === "MESSAGE_DELETE_BULK") {
      const guildId = packet.d.guild_id as string | undefined;
      const ids = Array.isArray(packet.d.ids) ? packet.d.ids : [];
      for (const messageId of ids) {
        await deleteHighlightsByDiscordMessage(guildId, messageId).catch((error) => {
          console.error("하이라이트 raw 일괄 삭제 이벤트 처리 오류:", error);
        });
      }
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    console.log(`서버 참가: ${guild.name} (${guild.id})`);
    const dbGuild = await prisma.guild.upsert({
      where: { discordId: guild.id },
      update: { name: guild.name },
      create: { discordId: guild.id, name: guild.name },
    });

    try {
      const members = await fetchGuildMembersSafely(guild);
      for (const [, member] of members) {
        if (member.user.bot) continue;

        const email = `${member.user.id}@discord`;
        const user = await prisma.user.upsert({
          where: { discordId: member.user.id },
          update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
          create: {
            discordId: member.user.id,
            email,
            name: member.user.displayName,
            image: member.user.displayAvatarURL(),
          },
        });

        const roles = member.roles.cache
          .filter((role) => role.name !== "@everyone")
          .map((role) => role.name)
          .join(",");

        await prisma.guildMember.upsert({
          where: { userId_guildId: { userId: user.id, guildId: dbGuild.id } },
          update: { roles, nickname: member.nickname ?? undefined },
          create: { userId: user.id, guildId: dbGuild.id, roles, nickname: member.nickname ?? undefined },
        });
      }
    } catch (error) {
      console.error("멤버 동기화 오류:", error);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    const guild = await prisma.guild.findUnique({ where: { discordId: member.guild.id } });
    if (!guild) return;

    const email = `${member.user.id}@discord`;
    const user = await prisma.user.upsert({
      where: { discordId: member.user.id },
      update: { name: member.user.displayName, image: member.user.displayAvatarURL() },
      create: {
        discordId: member.user.id,
        email,
        name: member.user.displayName,
        image: member.user.displayAvatarURL(),
      },
    });

    await prisma.guildMember.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
      update: {},
      create: { userId: user.id, guildId: guild.id },
    });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return;

    try {
      const guild = await prisma.guild.findUnique({ where: { discordId: member.guild.id } });
      const user = await prisma.user.findUnique({ where: { discordId: member.user.id } });
      if (!guild || !user) return;

      const now = new Date();
      const openActivities = await prisma.voiceActivity.findMany({
        where: { guildId: guild.id, userId: user.id, leftAt: null },
        select: { id: true, joinedAt: true },
      });

      for (const activity of openActivities) {
        const duration = Math.max(
          0,
          Math.min(Math.floor((now.getTime() - activity.joinedAt.getTime()) / 1000), MAX_VOICE_SESSION_SECONDS)
        );
        await prisma.voiceActivity.update({
          where: { id: activity.id },
          data: {
            leftAt: new Date(activity.joinedAt.getTime() + duration * 1000),
            duration,
          },
        });
      }

      await prisma.guildMember.deleteMany({
        where: { guildId: guild.id, userId: user.id },
      });
      console.log(`탈퇴 멤버 제거: ${member.user.tag ?? member.user.id}`);
    } catch (error) {
      console.error("탈퇴 멤버 제거 오류:", error);
    }
  });

  client.on(Events.PresenceUpdate, async (_, newPresence) => {
    if (!newPresence.userId || !newPresence.guild) return;

    try {
      const guild = await prisma.guild.findUnique({ where: { discordId: newPresence.guild.id } });
      if (!guild) return;

      const user = await prisma.user.findUnique({ where: { discordId: newPresence.userId } });
      if (!user) return;

      const isOnline = newPresence.status !== "offline" && newPresence.status !== "invisible";
      await prisma.guildMember.updateMany({
        where: { userId: user.id, guildId: guild.id },
        data: { isOnline },
      });
    } catch {}
  });

  client.on(Events.GuildMemberUpdate, async (_, member) => {
    if (member.user.bot) return;

    const guild = await prisma.guild.findUnique({ where: { discordId: member.guild.id } });
    if (!guild) return;

    const user = await prisma.user.findUnique({ where: { discordId: member.user.id } });
    if (!user) return;

    const roles = member.roles.cache
      .filter((role) => role.name !== "@everyone")
      .map((role) => role.name)
      .join(",");

    await prisma.guildMember.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
      update: { roles, nickname: member.nickname ?? undefined },
      create: { userId: user.id, guildId: guild.id, roles, nickname: member.nickname ?? undefined },
    });
  });
}
