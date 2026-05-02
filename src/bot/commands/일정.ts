import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("일정")
  .setDescription("내전 일정을 관리합니다.")
  .addSubcommand((sub) =>
    sub.setName("등록").setDescription("내전 일정을 등록합니다.")
      .addStringOption((o) => o.setName("제목").setDescription("일정 제목").setRequired(true))
      .addStringOption((o) => o.setName("날짜").setDescription("날짜 (예: 2026-05-10 20:00)").setRequired(true))
      .addStringOption((o) => o.setName("설명").setDescription("추가 설명").setRequired(false))
  )
  .addSubcommand((sub) => sub.setName("목록").setDescription("예정된 일정을 확인합니다."))
  .addSubcommand((sub) =>
    sub.setName("취소").setDescription("일정을 취소합니다.")
      .addStringOption((o: any) => o.setName("id").setDescription("취소할 일정 ID").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "등록") {
    await interaction.deferReply();
    const title = interaction.options.getString("제목", true);
    const dateStr = interaction.options.getString("날짜", true);
    const description = interaction.options.getString("설명") ?? undefined;

    const scheduledAt = new Date(dateStr);
    if (isNaN(scheduledAt.getTime())) {
      return interaction.editReply("❌ 날짜 형식이 올바르지 않아요. 예: `2026-05-10 20:00`");
    }
    if (scheduledAt < new Date()) {
      return interaction.editReply("❌ 과거 날짜는 등록할 수 없어요.");
    }

    const event = await prisma.scrimEvent.create({
      data: { guildId: guild.id, title, description, scheduledAt, createdBy: interaction.user.id },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📅 내전 일정 등록")
      .addFields(
        { name: "제목", value: title, inline: true },
        { name: "일시", value: scheduledAt.toLocaleString("ko-KR"), inline: true },
        { name: "ID", value: `\`${event.id.slice(-8)}\``, inline: true },
      );
    if (description) embed.addFields({ name: "설명", value: description });

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "목록") {
    await interaction.deferReply();
    const events = await prisma.scrimEvent.findMany({
      where: { guildId: guild.id, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });

    if (!events.length) return interaction.editReply("📋 예정된 일정이 없어요.");

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📅 예정된 내전 일정")
      .setDescription(
        events.map((e) => {
          const diff = Math.floor((e.scheduledAt.getTime() - Date.now()) / 3600000);
          const timeStr = diff < 24 ? `${diff}시간 후` : `${Math.floor(diff / 24)}일 후`;
          return `**${e.title}** — ${e.scheduledAt.toLocaleString("ko-KR")} *(${timeStr})*\nID: \`${e.id.slice(-8)}\``;
        }).join("\n\n")
      );

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "취소") {
    await interaction.deferReply({ ephemeral: true });
    const shortId = interaction.options.getString("id", true);

    const event = await prisma.scrimEvent.findFirst({
      where: { guildId: guild.id, id: { endsWith: shortId } },
    });

    if (!event) return interaction.editReply("❌ 해당 ID의 일정을 찾을 수 없어요.");

    await prisma.scrimEvent.delete({ where: { id: event.id } });
    await interaction.editReply(`✅ **${event.title}** 일정을 취소했어요.`);
  }
}
