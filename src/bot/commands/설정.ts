import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("설정")
  .setDescription("봇 설정을 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("알림채널")
      .setDescription("매치 알림을 받을 채널을 설정합니다.")
      .addChannelOption((opt) =>
        opt
          .setName("채널")
          .setDescription("알림 채널")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("추적추가")
      .setDescription("매치 결과를 자동으로 추적할 플레이어를 추가합니다.")
      .addStringOption((opt) =>
        opt.setName("닉네임").setDescription("라이엇 닉네임#태그").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("추적목록").setDescription("현재 추적 중인 플레이어 목록을 확인합니다.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("추적삭제")
      .setDescription("추적 플레이어를 제거합니다.")
      .addStringOption((opt) =>
        opt.setName("닉네임").setDescription("라이엇 닉네임#태그").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { discordId: guildId },
    update: {},
    create: { discordId: guildId, name: interaction.guild!.name },
  });

  if (sub === "알림채널") {
    const channel = interaction.options.getChannel("채널", true);
    await prisma.guild.update({
      where: { discordId: guildId },
      data: { notifyChannelId: channel.id },
    });
    await interaction.editReply(`✅ 알림 채널이 <#${channel.id}>로 설정됐어요.`);
  } else if (sub === "추적추가") {
    const input = interaction.options.getString("닉네임", true);
    const [gameName, tagLine] = input.split("#");
    if (!gameName || !tagLine) {
      return interaction.editReply("❌ 닉네임 형식이 올바르지 않아요. 예시: `플레이어#KR1`");
    }
    const { getPlayerByRiotId } = await import("../../lib/valorant");
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const guild = await prisma.guild.findUnique({ where: { discordId: guildId } });
    await prisma.trackedPlayer.upsert({
      where: { guildId_riotPuuid: { guildId: guild!.id, riotPuuid: profile.puuid } },
      update: {},
      create: {
        guildId: guild!.id,
        riotPuuid: profile.puuid,
        gameName: profile.gameName,
        tagLine: profile.tagLine,
      },
    });
    await interaction.editReply(`✅ **${profile.gameName}#${profile.tagLine}** 추적을 시작했어요.`);
  } else if (sub === "추적목록") {
    const guild = await prisma.guild.findUnique({
      where: { discordId: guildId },
      include: { trackedPlayers: true },
    });
    if (!guild?.trackedPlayers.length) {
      return interaction.editReply("📋 추적 중인 플레이어가 없어요.");
    }
    const list = guild.trackedPlayers
      .map((p, i) => `${i + 1}. **${p.gameName}#${p.tagLine}**`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📋 추적 플레이어 목록")
      .setDescription(list);
    await interaction.editReply({ embeds: [embed] });
  } else if (sub === "추적삭제") {
    const input = interaction.options.getString("닉네임", true);
    const [gameName, tagLine] = input.split("#");
    const guild = await prisma.guild.findUnique({
      where: { discordId: guildId },
      include: { trackedPlayers: { where: { gameName, tagLine } } },
    });
    if (!guild?.trackedPlayers.length) {
      return interaction.editReply("❌ 해당 플레이어를 추적 목록에서 찾을 수 없어요.");
    }
    await prisma.trackedPlayer.delete({ where: { id: guild.trackedPlayers[0].id } });
    await interaction.editReply(`✅ **${gameName}#${tagLine}** 추적을 중단했어요.`);
  }
}
