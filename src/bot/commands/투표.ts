import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("투표")
  .setDescription("투표를 생성하고 관리합니다.")
  .addSubcommand((sub) =>
    sub.setName("생성").setDescription("새 투표를 생성합니다.")
      .addStringOption((o) => o.setName("제목").setDescription("투표 제목").setRequired(true))
      .addStringOption((o) => o.setName("선택지").setDescription("선택지 (쉼표로 구분, 최대 5개)").setRequired(true))
      .addIntegerOption((o) => o.setName("시간").setDescription("투표 시간 (시간, 기본 24)").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub.setName("결과").setDescription("투표 결과를 확인합니다.")
      .addStringOption((o) => o.setName("id").setDescription("투표 ID (마지막 8자리)").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "생성") {
    await interaction.deferReply();
    const title = interaction.options.getString("제목", true);
    const optionsStr = interaction.options.getString("선택지", true);
    const hours = interaction.options.getInteger("시간") ?? 24;

    const labels = optionsStr.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (labels.length < 2) return interaction.editReply("❌ 선택지를 2개 이상 입력해주세요.");

    const endsAt = new Date(Date.now() + hours * 3600 * 1000);

    const vote = await prisma.vote.create({
      data: {
        guildId: guild.id,
        title,
        createdBy: interaction.user.id,
        endsAt,
        options: { create: labels.map((label) => ({ label })) },
      },
      include: { options: true },
    });

    const buttons = vote.options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`vote_${vote.id}_${opt.id}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary)
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🗳️ ${title}`)
      .setDescription(labels.map((l, i) => `**${i + 1}.** ${l}`).join("\n"))
      .setFooter({ text: `종료: ${endsAt.toLocaleString("ko-KR")} | ID: ${vote.id.slice(-8)}` });

    await interaction.editReply({ embeds: [embed], components: rows });

    // 버튼 핸들링은 events/index.ts의 인터랙션 핸들러에서 처리

  } else if (sub === "결과") {
    await interaction.deferReply();
    const shortId = interaction.options.getString("id", true);

    const vote = await prisma.vote.findFirst({
      where: { guildId: guild.id, id: { endsWith: shortId } },
      include: { options: { include: { responses: true } }, responses: true },
    });

    if (!vote) return interaction.editReply("❌ 투표를 찾을 수 없어요.");

    const total = vote.responses.length;
    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🗳️ ${vote.title} — 결과`)
      .setDescription(
        vote.options.map((opt) => {
          const count = opt.responses.length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
          return `**${opt.label}**\n${bar} ${pct}% (${count}표)`;
        }).join("\n\n")
      )
      .setFooter({ text: `총 ${total}명 참여` });

    await interaction.editReply({ embeds: [embed] });
  }
}
