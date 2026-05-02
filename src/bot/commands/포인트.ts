import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("포인트")
  .setDescription("클랜 포인트를 관리합니다.")
  .addSubcommand((sub) => sub.setName("내포인트").setDescription("내 포인트를 확인합니다."))
  .addSubcommand((sub) =>
    sub.setName("랭킹").setDescription("포인트 랭킹을 확인합니다.")
  )
  .addSubcommand((sub) =>
    sub.setName("지급").setDescription("포인트를 지급합니다.")
      .addUserOption((o: any) => o.setName("멤버").setDescription("대상 멤버").setRequired(true))
      .addIntegerOption((o: any) => o.setName("금액").setDescription("지급할 포인트").setRequired(true))
      .addStringOption((o: any) => o.setName("사유").setDescription("지급 사유").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("차감").setDescription("포인트를 차감합니다.")
      .addUserOption((o: any) => o.setName("멤버").setDescription("대상 멤버").setRequired(true))
      .addIntegerOption((o: any) => o.setName("금액").setDescription("차감할 포인트").setRequired(true))
      .addStringOption((o: any) => o.setName("사유").setDescription("차감 사유").setRequired(true))
  );

async function getUserPoints(userId: string, guildId: string): Promise<number> {
  const result = await prisma.pointTransaction.aggregate({
    where: { userId, guildId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: interaction.options.getSubcommand() !== "랭킹" });
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  const email = `${interaction.user.id}@discord`;
  const me = await prisma.user.upsert({
    where: { discordId: interaction.user.id },
    update: {},
    create: { discordId: interaction.user.id, email, name: interaction.user.displayName },
  });

  if (sub === "내포인트") {
    const total = await getUserPoints(me.id, guild.id);
    const txs = await prisma.pointTransaction.findMany({
      where: { userId: me.id, guildId: guild.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("💎 내 클랜 포인트")
      .addFields({ name: "보유 포인트", value: `**${total.toLocaleString()} P**` });

    if (txs.length) {
      embed.addFields({
        name: "최근 내역",
        value: txs.map((t) =>
          `${t.amount > 0 ? "+" : ""}${t.amount}P — ${t.reason} *(${t.createdAt.toLocaleDateString("ko-KR")})*`
        ).join("\n"),
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "랭킹") {
    const txs = await prisma.pointTransaction.groupBy({
      by: ["userId"],
      where: { guildId: guild.id },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    });

    if (!txs.length) return interaction.editReply("📋 포인트 데이터가 없어요.");

    const users = await Promise.all(
      txs.map((t) => prisma.user.findUnique({ where: { id: t.userId } }))
    );

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("💎 클랜 포인트 랭킹")
      .setDescription(
        txs.map((t, i) => {
          const u = users[i];
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          return `${medal} <@${u?.discordId}> — **${(t._sum.amount ?? 0).toLocaleString()} P**`;
        }).join("\n")
      );

    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "지급" || sub === "차감") {
    const target = interaction.options.getMember("멤버") as GuildMember;
    const amount = Math.abs(interaction.options.getInteger("금액", true));
    const reason = interaction.options.getString("사유", true);
    const finalAmount = sub === "지급" ? amount : -amount;

    if (!target) return interaction.editReply("❌ 멤버를 찾을 수 없어요.");

    const targetEmail = `${target.id}@discord`;
    const targetUser = await prisma.user.upsert({
      where: { discordId: target.id },
      update: {},
      create: { discordId: target.id, email: targetEmail, name: target.displayName },
    });

    await prisma.pointTransaction.create({
      data: { userId: targetUser.id, guildId: guild.id, amount: finalAmount, reason, type: "manual" },
    });

    const newTotal = await getUserPoints(targetUser.id, guild.id);
    await interaction.editReply(
      `✅ <@${target.id}>에게 **${finalAmount > 0 ? "+" : ""}${finalAmount}P** ${sub === "지급" ? "지급" : "차감"}했어요.\n현재 보유: **${newTotal.toLocaleString()} P**`
    );
  }
}
