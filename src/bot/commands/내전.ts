import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("내전")
  .setDescription("내전을 관리합니다.")
  .addSubcommand((sub) =>
    sub
      .setName("시작")
      .setDescription("새 내전을 시작합니다.")
      .addStringOption((opt) =>
        opt.setName("제목").setDescription("내전 제목 (선택)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("목록")
      .setDescription("최근 내전 기록을 확인합니다.")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "시작") {
    const title = interaction.options.getString("제목") ?? "내전";

    // 현재 음성채널에 있는 멤버 수집
    const voiceChannel = (interaction.member as GuildMember)?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: "❌ 음성 채널에 입장한 후 사용해주세요.", flags: MessageFlags.Ephemeral });
    }

    const members = voiceChannel.members.filter((m) => !m.user.bot);
    if (members.size < 2) {
      return interaction.reply({ content: "❌ 내전을 위해 최소 2명이 필요해요.", flags: MessageFlags.Ephemeral });
    }

    // 팀 자동 랜덤 배정
    const memberArr = [...members.values()];
    const shuffled = memberArr.sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, half);
    const teamB = shuffled.slice(half);

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`⚔️ ${title}`)
      .setDescription(`${voiceChannel.name}에서 내전이 시작됩니다!`)
      .addFields(
        {
          name: "🔴 팀 A",
          value: teamA.map((m) => `<@${m.id}>`).join("\n") || "없음",
          inline: true,
        },
        {
          name: "🔵 팀 B",
          value: teamB.map((m) => `<@${m.id}>`).join("\n") || "없음",
          inline: true,
        }
      )
      .setFooter({ text: "결과를 선택해주세요" })
      .setTimestamp();

    const winA = new ButtonBuilder().setCustomId("win_a").setLabel("팀 A 승리").setStyle(ButtonStyle.Danger);
    const winB = new ButtonBuilder().setCustomId("win_b").setLabel("팀 B 승리").setStyle(ButtonStyle.Primary);
    const draw = new ButtonBuilder().setCustomId("draw").setLabel("무승부").setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(winA, winB, draw);

    const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    // 결과 버튼 대기 (5분)
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: "❌ 내전을 시작한 사람만 결과를 입력할 수 있어요.", flags: MessageFlags.Ephemeral });
      }

      const winnerId = btn.customId === "win_a" ? "team_a" : btn.customId === "win_b" ? "team_b" : "draw";
      const winnerLabel = winnerId === "team_a" ? "팀 A 승리" : winnerId === "team_b" ? "팀 B 승리" : "무승부";

      // DB 저장
      try {
        const session = await prisma.scrimSession.create({
          data: {
            guildId: guild.id,
            title,
            status: "done",
            winnerId,
            createdBy: interaction.user.id,
            startedAt: new Date(reply.createdTimestamp),
            endedAt: new Date(),
          },
        });

        // 참가자 저장
        const savePlayer = async (member: GuildMember, team: string) => {
          const email = `${member.id}@discord`;
          const user = await prisma.user.upsert({
            where: { discordId: member.id },
            update: {},
            create: { discordId: member.id, email, name: member.displayName },
          });
          await prisma.scrimPlayer.upsert({
            where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
            update: {},
            create: { sessionId: session.id, userId: user.id, team },
          });
        };

        await Promise.all([
          ...teamA.map((m) => savePlayer(m, "team_a")),
          ...teamB.map((m) => savePlayer(m, "team_b")),
        ]);
      } catch (e) {
        console.error("내전 저장 오류:", e);
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(winnerId === "draw" ? 0x71717a : 0xff4655)
        .setTitle(`⚔️ ${title} — ${winnerLabel}`)
        .addFields(
          { name: "🔴 팀 A", value: teamA.map((m) => `<@${m.id}>`).join("\n") || "없음", inline: true },
          { name: "🔵 팀 B", value: teamB.map((m) => `<@${m.id}>`).join("\n") || "없음", inline: true }
        )
        .setTimestamp();

      await btn.update({ embeds: [resultEmbed], components: [] });
      collector.stop();
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await interaction.editReply({ components: [] });
      }
    });

  } else if (sub === "목록") {
    await interaction.deferReply();
    const sessions = await prisma.scrimSession.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { players: { include: { user: true } } },
    });

    if (!sessions.length) {
      return interaction.editReply("📋 아직 내전 기록이 없어요.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📋 최근 내전 기록");

    for (const s of sessions) {
      const winner = s.winnerId === "team_a" ? "🔴 팀 A 승" : s.winnerId === "team_b" ? "🔵 팀 B 승" : "🤝 무승부";
      const date = s.createdAt.toLocaleDateString("ko-KR");
      embed.addFields({ name: `${s.title} — ${winner} (${date})`, value: "​" });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
