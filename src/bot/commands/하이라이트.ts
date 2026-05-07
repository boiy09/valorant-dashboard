import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("하이라이트")
  .setDescription("하이라이트 자동 등록 채널을 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("채널")
      .setDescription("영상이 올라오면 하이라이트 탭에 자동 등록될 채널을 설정합니다.")
      .addChannelOption((option) =>
        option
          .setName("채널")
          .setDescription("예: #발로-클립")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("해제").setDescription("하이라이트 자동 등록 채널 설정을 해제합니다.")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildDiscordId = interaction.guildId;
  if (!guildDiscordId || !interaction.guild) {
    await interaction.editReply("서버 안에서만 사용할 수 있습니다.");
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "채널") {
    const channel = interaction.options.getChannel("채널", true);

    await prisma.guild.upsert({
      where: { discordId: guildDiscordId },
      update: {
        name: interaction.guild.name,
        highlightChannelId: channel.id,
      },
      create: {
        discordId: guildDiscordId,
        name: interaction.guild.name,
        highlightChannelId: channel.id,
      },
    });

    await interaction.editReply(`하이라이트 자동 등록 채널을 <#${channel.id}>로 설정했습니다.`);
    return;
  }

  if (subcommand === "해제") {
    await prisma.guild.upsert({
      where: { discordId: guildDiscordId },
      update: {
        name: interaction.guild.name,
        highlightChannelId: null,
      },
      create: {
        discordId: guildDiscordId,
        name: interaction.guild.name,
        highlightChannelId: null,
      },
    });

    await interaction.editReply("하이라이트 자동 등록 채널 설정을 해제했습니다.");
  }
}
