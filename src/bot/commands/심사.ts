import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("심사")
  .setDescription("가입 심사를 관리합니다.")
  .addSubcommand((sub) =>
    sub.setName("신청").setDescription("커뮤니티 가입을 신청합니다.")
      .addStringOption((o: any) => o.setName("라이엇아이디").setDescription("닉네임#태그").setRequired(true))
      .addStringOption((o: any) => o.setName("주에이전트").setDescription("주로 사용하는 에이전트").setRequired(true))
      .addStringOption((o: any) => o.setName("플레이타임").setDescription("일일 평균 플레이 시간 (예: 3시간)").setRequired(true))
      .addStringOption((o: any) => o.setName("지원동기").setDescription("가입 이유를 작성해주세요").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("목록").setDescription("대기 중인 신청 목록을 확인합니다.")
  )
  .addSubcommand((sub) =>
    sub.setName("처리").setDescription("신청을 승인/거절합니다.")
      .addUserOption((o: any) => o.setName("멤버").setDescription("처리할 멤버").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "신청") {
    await interaction.deferReply({ ephemeral: true });
    const email = `${interaction.user.id}@discord`;
    const user = await prisma.user.upsert({
      where: { discordId: interaction.user.id },
      update: {},
      create: { discordId: interaction.user.id, email, name: interaction.user.displayName },
    });

    const existing = await prisma.memberApplication.findUnique({
      where: { userId_guildId: { userId: user.id, guildId: guild.id } },
    });
    if (existing) {
      const statusMap: Record<string, string> = { pending: "심사 대기 중", approved: "승인됨", rejected: "거절됨" };
      return interaction.editReply(`⚠️ 이미 신청한 내역이 있어요. 현재 상태: **${statusMap[existing.status]}**`);
    }

    const app = await prisma.memberApplication.create({
      data: {
        userId: user.id,
        guildId: guild.id,
        riotId: interaction.options.getString("라이엇아이디", true),
        mainAgent: interaction.options.getString("주에이전트", true),
        playtime: interaction.options.getString("플레이타임", true),
        motivation: interaction.options.getString("지원동기", true),
      },
    });

    await interaction.editReply("✅ 신청이 접수됐어요! 관리자 심사 후 결과를 알려드릴게요.");

    // 관리자 채널에 알림
    const guildData = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
    if (guildData?.notifyChannelId) {
      const ch = interaction.guild?.channels.cache.get(guildData.notifyChannelId);
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xfbbf24)
          .setTitle("📋 새 가입 신청")
          .addFields(
            { name: "신청자", value: `<@${interaction.user.id}>`, inline: true },
            { name: "라이엇 ID", value: app.riotId, inline: true },
            { name: "주 에이전트", value: app.mainAgent, inline: true },
            { name: "플레이타임", value: app.playtime, inline: true },
            { name: "지원동기", value: app.motivation },
          )
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    }

  } else if (sub === "목록") {
    await interaction.deferReply({ ephemeral: true });
    const apps = await prisma.memberApplication.findMany({
      where: { guildId: guild.id, status: "pending" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    if (!apps.length) return interaction.editReply("📋 대기 중인 신청이 없어요.");

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📋 심사 대기 목록")
      .setDescription(
        apps.map((a, i) =>
          `${i + 1}. <@${a.user.discordId}> — \`${a.riotId}\` (${a.mainAgent})`
        ).join("\n")
      );

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "처리") {
    const target = interaction.options.getUser("멤버", true);
    const targetUser = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!targetUser) return interaction.reply({ content: "❌ 신청자를 찾을 수 없어요.", ephemeral: true });

    const app = await prisma.memberApplication.findUnique({
      where: { userId_guildId: { userId: targetUser.id, guildId: guild.id } },
    });
    if (!app || app.status !== "pending") {
      return interaction.reply({ content: "❌ 대기 중인 신청이 없어요.", ephemeral: true });
    }

    const approve = new ButtonBuilder().setCustomId("approve").setLabel("승인").setStyle(ButtonStyle.Success);
    const reject = new ButtonBuilder().setCustomId("reject").setLabel("거절").setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approve, reject);

    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle("📋 가입 신청 심사")
      .addFields(
        { name: "신청자", value: `<@${target.id}>`, inline: true },
        { name: "라이엇 ID", value: app.riotId, inline: true },
        { name: "주 에이전트", value: app.mainAgent, inline: true },
        { name: "플레이타임", value: app.playtime, inline: true },
        { name: "지원동기", value: app.motivation },
      );

    const reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
    collector.on("collect", async (btn) => {
      const status = btn.customId === "approve" ? "approved" : "rejected";
      await prisma.memberApplication.update({
        where: { id: app.id },
        data: { status, reviewedBy: interaction.user.id, updatedAt: new Date() },
      });

      if (status === "approved") {
        await prisma.pointTransaction.create({
          data: { userId: targetUser.id, guildId: guild.id, amount: 100, reason: "가입 승인", type: "manual" },
        });
      }

      await btn.update({
        embeds: [embed.setColor(status === "approved" ? 0x4ade80 : 0xff4655)
          .setTitle(`📋 ${status === "approved" ? "✅ 승인됨" : "❌ 거절됨"}`)],
        components: [],
      });

      // 신청자에게 DM
      try {
        const dm = await target.createDM();
        await dm.send(status === "approved"
          ? `✅ **가입 신청이 승인됐어요!** 환영합니다!`
          : `❌ **가입 신청이 거절됐어요.** 궁금한 점은 관리자에게 문의해주세요.`
        );
      } catch {}

      collector.stop();
    });
  }
}
