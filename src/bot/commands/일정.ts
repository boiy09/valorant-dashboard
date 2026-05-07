import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("일정")
  .setDescription("내전, 연습, 이벤트 일정을 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("등록")
      .setDescription("새 일정을 등록합니다.")
      .addStringOption((option) =>
        option.setName("제목").setDescription("일정 제목").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("날짜").setDescription("예: 2026-05-10 20:00").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("설명").setDescription("추가 설명").setRequired(false)
      )
  )
  .addSubcommand((sub) => sub.setName("목록").setDescription("예정된 일정을 확인합니다."))
  .addSubcommand((sub) =>
    sub
      .setName("취소")
      .setDescription("등록된 일정을 취소합니다.")
      .addStringOption((option) =>
        option.setName("id").setDescription("취소할 일정 ID 마지막 8자리").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId;

  if (!guildDiscordId || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: { name: interaction.guild.name },
    create: { discordId: guildDiscordId, name: interaction.guild.name },
  });

  if (subcommand === "등록") {
    await interaction.deferReply();

    const title = interaction.options.getString("제목", true);
    const dateText = interaction.options.getString("날짜", true);
    const description = interaction.options.getString("설명") ?? undefined;
    const scheduledAt = new Date(dateText);

    if (Number.isNaN(scheduledAt.getTime())) {
      await interaction.editReply("날짜 형식이 올바르지 않습니다. 예: `2026-05-10 20:00`");
      return;
    }

    if (scheduledAt < new Date()) {
      await interaction.editReply("지난 날짜는 등록할 수 없습니다.");
      return;
    }

    const event = await prisma.scrimEvent.create({
      data: {
        guildId: guild.id,
        title,
        description,
        scheduledAt,
        createdBy: interaction.user.id,
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("일정 등록")
      .addFields(
        { name: "제목", value: title, inline: true },
        { name: "일시", value: scheduledAt.toLocaleString("ko-KR"), inline: true },
        { name: "ID", value: `\`${event.id.slice(-8)}\``, inline: true }
      );

    if (description) embed.addFields({ name: "설명", value: description });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "목록") {
    await interaction.deferReply({ ephemeral: true });

    const events = await prisma.scrimEvent.findMany({
      where: { guildId: guild.id, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });

    if (!events.length) {
      await interaction.editReply("예정된 일정이 없습니다.");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("예정된 일정")
      .setDescription(
        events
          .map((event) => `**${event.title}**\n${event.scheduledAt.toLocaleString("ko-KR")}\nID: \`${event.id.slice(-8)}\``)
          .join("\n\n")
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "취소") {
    await interaction.deferReply({ ephemeral: true });

    const shortId = interaction.options.getString("id", true);
    const event = await prisma.scrimEvent.findFirst({
      where: { guildId: guild.id, id: { endsWith: shortId } },
    });

    if (!event) {
      await interaction.editReply("해당 ID의 일정을 찾을 수 없습니다.");
      return;
    }

    await prisma.scrimEvent.delete({ where: { id: event.id } });
    await interaction.editReply(`일정 **${event.title}**을 취소했습니다.`);
  }
}
