import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";

type RiotRegion = "KR" | "AP";

const REGION_CHOICES = [
  { name: "KR · 한섭", value: "KR" },
  { name: "AP · 아섭", value: "AP" },
] as const;

export const data = new SlashCommandBuilder()
  .setName("설정")
  .setDescription("길드 운영 설정을 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("알림채널")
      .setDescription("매치 알림을 받을 채널을 설정합니다.")
      .addChannelOption((option) =>
        option
          .setName("채널")
          .setDescription("알림을 보낼 텍스트 채널")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("추적추가")
      .setDescription("자동 추적할 플레이어를 추가합니다.")
      .addStringOption((option) =>
        option
          .setName("라이엇아이디")
          .setDescription("예: Player#KR1")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("지역")
          .setDescription("추적할 계정의 지역")
          .setRequired(true)
          .addChoices(...REGION_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("추적목록").setDescription("현재 자동 추적 중인 플레이어 목록을 확인합니다.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("추적제거")
      .setDescription("자동 추적 중인 플레이어를 제거합니다.")
      .addStringOption((option) =>
        option
          .setName("라이엇아이디")
          .setDescription("예: Player#KR1")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("지역")
          .setDescription("제거할 계정의 지역")
          .setRequired(true)
          .addChoices(...REGION_CHOICES)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: { name: interaction.guild!.name },
    create: {
      discordId: guildDiscordId,
      name: interaction.guild!.name,
    },
  });

  if (subcommand === "알림채널") {
    const channel = interaction.options.getChannel("채널", true);

    await prisma.guild.update({
      where: { discordId: guildDiscordId },
      data: { notifyChannelId: channel.id },
    });

    await interaction.editReply(`알림 채널을 <#${channel.id}>로 설정했습니다.`);
    return;
  }

  if (subcommand === "추적추가") {
    const input = interaction.options.getString("라이엇아이디", true);
    const region = interaction.options.getString("지역", true) as RiotRegion;
    const [gameName, tagLine] = input.split("#");

    if (!gameName || !tagLine) {
      await interaction.editReply("라이엇아이디 형식이 올바르지 않습니다. 예: Player#KR1");
      return;
    }

    const { getPlayerByRiotId } = await import("../../lib/valorant");
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const guild = await prisma.guild.findUnique({
      where: { discordId: guildDiscordId },
    });

    if (!guild) {
      await interaction.editReply("길드 정보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    await prisma.trackedPlayer.upsert({
      where: {
        guildId_riotPuuid: {
          guildId: guild.id,
          riotPuuid: profile.puuid,
        },
      },
      update: {
        gameName: profile.gameName,
        tagLine: profile.tagLine,
        region,
      },
      create: {
        guildId: guild.id,
        riotPuuid: profile.puuid,
        gameName: profile.gameName,
        tagLine: profile.tagLine,
        region,
      },
    });

    await interaction.editReply(
      `**${profile.gameName}#${profile.tagLine}** 플레이어를 ${region} 추적 목록에 추가했습니다.`
    );
    return;
  }

  if (subcommand === "추적목록") {
    const guild = await prisma.guild.findUnique({
      where: { discordId: guildDiscordId },
      include: {
        trackedPlayers: {
          orderBy: [{ region: "asc" }, { gameName: "asc" }],
        },
      },
    });

    if (!guild?.trackedPlayers.length) {
      await interaction.editReply("현재 자동 추적 중인 플레이어가 없습니다.");
      return;
    }

    const list = guild.trackedPlayers
      .map((player, index) => `${index + 1}. **${player.gameName}#${player.tagLine}** (${player.region})`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("추적 플레이어 목록")
      .setDescription(list);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "추적제거") {
    const input = interaction.options.getString("라이엇아이디", true);
    const region = interaction.options.getString("지역", true) as RiotRegion;
    const [gameName, tagLine] = input.split("#");

    if (!gameName || !tagLine) {
      await interaction.editReply("라이엇아이디 형식이 올바르지 않습니다. 예: Player#KR1");
      return;
    }

    const guild = await prisma.guild.findUnique({
      where: { discordId: guildDiscordId },
      include: {
        trackedPlayers: {
          where: { gameName, tagLine, region },
        },
      },
    });

    if (!guild?.trackedPlayers.length) {
      await interaction.editReply("해당 플레이어를 추적 목록에서 찾을 수 없습니다.");
      return;
    }

    await prisma.trackedPlayer.delete({
      where: { id: guild.trackedPlayers[0].id },
    });

    await interaction.editReply(
      `**${gameName}#${tagLine}** 플레이어를 ${region} 추적 목록에서 제거했습니다.`
    );
  }
}
