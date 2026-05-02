import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { prisma } from "../../lib/prisma";

const QUEUE_SIZE = 10;

function calcEloChange(won: boolean, opponentAvgElo: number, myElo: number): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (opponentAvgElo - myElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(K * (actual - expected));
}

export const data = new SlashCommandBuilder()
  .setName("큐")
  .setDescription("내전 큐를 관리합니다.")
  .addSubcommand((sub) => sub.setName("참가").setDescription("내전 큐에 참가합니다."))
  .addSubcommand((sub) => sub.setName("나가기").setDescription("내전 큐에서 나갑니다."))
  .addSubcommand((sub) => sub.setName("현황").setDescription("현재 큐 현황을 확인합니다."))
  .addSubcommand((sub) => sub.setName("랭킹").setDescription("내전 ELO 랭킹을 확인합니다."));

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  const email = `${interaction.user.id}@discord`;
  const user = await prisma.user.upsert({
    where: { discordId: interaction.user.id },
    update: {},
    create: { discordId: interaction.user.id, email, name: interaction.user.displayName },
  });

  if (sub === "참가") {
    await interaction.deferReply();

    const existing = await prisma.scrimQueueEntry.findUnique({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
    });
    if (existing) return interaction.editReply("⚠️ 이미 큐에 있어요!");

    await prisma.scrimQueueEntry.create({ data: { userId: user.id, guildId: guild.id } });

    const queue = await prisma.scrimQueueEntry.findMany({
      where: { guildId: guild.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🎮 내전 큐 (${queue.length}/${QUEUE_SIZE})`)
      .setDescription(queue.map((q, i) => `${i + 1}. <@${q.user.discordId}>`).join("\n") || "없음");

    if (queue.length >= QUEUE_SIZE) {
      // 자동 팀 배정
      const shuffled = [...queue].sort(() => Math.random() - 0.5);
      const teamA = shuffled.slice(0, QUEUE_SIZE / 2);
      const teamB = shuffled.slice(QUEUE_SIZE / 2);

      const session = await prisma.scrimSession.create({
        data: {
          guildId: guild.id,
          title: "큐 내전",
          status: "playing",
          createdBy: interaction.user.id,
          startedAt: new Date(),
        },
      });

      for (const q of teamA) {
        await prisma.scrimPlayer.create({ data: { sessionId: session.id, userId: q.userId, team: "team_a" } });
      }
      for (const q of teamB) {
        await prisma.scrimPlayer.create({ data: { sessionId: session.id, userId: q.userId, team: "team_b" } });
      }

      // 큐 초기화
      await prisma.scrimQueueEntry.deleteMany({ where: { guildId: guild.id } });

      embed
        .setTitle("⚔️ 내전 시작!")
        .setDescription("10명이 모여 내전이 시작됩니다!")
        .addFields(
          { name: "🔴 팀 A", value: teamA.map((q) => `<@${q.user.discordId}>`).join("\n"), inline: true },
          { name: "🔵 팀 B", value: teamB.map((q) => `<@${q.user.discordId}>`).join("\n"), inline: true },
        );
    }

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "나가기") {
    await interaction.deferReply({ ephemeral: true });
    const deleted = await prisma.scrimQueueEntry.deleteMany({
      where: { userId: user.id, guildId: guild.id },
    });
    if (deleted.count === 0) return interaction.editReply("⚠️ 큐에 있지 않아요.");
    await interaction.editReply("✅ 큐에서 나왔어요.");

  } else if (sub === "현황") {
    await interaction.deferReply();
    const queue = await prisma.scrimQueueEntry.findMany({
      where: { guildId: guild.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🎮 내전 큐 현황 (${queue.length}/${QUEUE_SIZE})`)
      .setDescription(
        queue.length === 0
          ? "현재 큐에 아무도 없어요."
          : queue.map((q, i) => `${i + 1}. <@${q.user.discordId}>`).join("\n")
      );

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "랭킹") {
    await interaction.deferReply();
    const elos = await prisma.scrimElo.findMany({
      where: { guildId: guild.id },
      include: { user: true },
      orderBy: { elo: "desc" },
      take: 10,
    });

    if (!elos.length) return interaction.editReply("📋 아직 내전 ELO 데이터가 없어요.");

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("🏆 내전 ELO 랭킹")
      .setDescription(
        elos.map((e, i) =>
          `${i + 1}. <@${e.user.discordId}> — **${e.elo} ELO** (${e.wins}승 ${e.losses}패)`
        ).join("\n")
      );

    await interaction.editReply({ embeds: [embed] });
  }
}
