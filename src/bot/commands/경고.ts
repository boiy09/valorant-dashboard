import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("경고")
  .setDescription("경고를 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub.setName("발급").setDescription("멤버에게 경고를 발급합니다.")
      .addUserOption((o) => o.setName("멤버").setDescription("대상 멤버").setRequired(true))
      .addStringOption((o) => o.setName("사유").setDescription("경고 사유").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("조회").setDescription("멤버의 경고 내역을 조회합니다.")
      .addUserOption((o) => o.setName("멤버").setDescription("대상 멤버").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("취소").setDescription("경고를 취소합니다.")
      .addUserOption((o) => o.setName("멤버").setDescription("대상 멤버").setRequired(true))
  );

async function getOrCreateUser(discordId: string, name: string) {
  const email = `${discordId}@discord`;
  return prisma.user.upsert({
    where: { discordId },
    update: {},
    create: { discordId, email, name },
  });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "발급") {
    const target = interaction.options.getMember("멤버") as GuildMember;
    const reason = interaction.options.getString("사유", true);
    if (!target) return interaction.editReply("❌ 멤버를 찾을 수 없어요.");

    const user = await getOrCreateUser(target.id, target.displayName);
    await prisma.warning.create({
      data: { userId: user.id, guildId: guild.id, reason, issuedBy: interaction.user.id },
    });

    const activeCount = await prisma.warning.count({ where: { userId: user.id, guildId: guild.id, active: true } });

    // 포인트 차감
    await prisma.pointTransaction.create({
      data: { userId: user.id, guildId: guild.id, amount: -50, reason: `경고: ${reason}`, type: "penalty" },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("⚠️ 경고 발급")
      .addFields(
        { name: "대상", value: `<@${target.id}>`, inline: true },
        { name: "사유", value: reason, inline: true },
        { name: "누적 경고", value: `${activeCount}회`, inline: true },
      )
      .setFooter({ text: `발급자: ${interaction.user.displayName}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // 알림채널에 공개 전송
    const guildData = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
    if (guildData?.notifyChannelId) {
      const ch = interaction.guild?.channels.cache.get(guildData.notifyChannelId);
      if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
    }

  } else if (sub === "조회") {
    const target = interaction.options.getMember("멤버") as GuildMember;
    if (!target) return interaction.editReply("❌ 멤버를 찾을 수 없어요.");

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!user) return interaction.editReply("📋 경고 기록이 없어요.");

    const warnings = await prisma.warning.findMany({
      where: { userId: user.id, guildId: guild.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (!warnings.length) return interaction.editReply("📋 경고 기록이 없어요.");

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`⚠️ ${target.displayName}의 경고 내역`)
      .setDescription(
        warnings.map((w, i) =>
          `${i + 1}. ${w.active ? "🔴" : "⚫"} ${w.reason} *(${w.createdAt.toLocaleDateString("ko-KR")})*`
        ).join("\n")
      );

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "취소") {
    const target = interaction.options.getMember("멤버") as GuildMember;
    if (!target) return interaction.editReply("❌ 멤버를 찾을 수 없어요.");

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!user) return interaction.editReply("📋 취소할 경고가 없어요.");

    const latest = await prisma.warning.findFirst({
      where: { userId: user.id, guildId: guild.id, active: true },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) return interaction.editReply("📋 활성 경고가 없어요.");

    await prisma.warning.update({ where: { id: latest.id }, data: { active: false } });
    await interaction.editReply(`✅ <@${target.id}>의 최근 경고를 취소했어요.`);
  }
}
