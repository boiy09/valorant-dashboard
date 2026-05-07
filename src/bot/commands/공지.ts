import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { prisma } from "../../lib/prisma";

export const data = new SlashCommandBuilder()
  .setName("공지")
  .setDescription("공지를 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("작성")
      .setDescription("새 공지를 작성합니다.")
      .addStringOption((opt) =>
        opt.setName("제목").setDescription("공지 제목").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("내용").setDescription("공지 내용").setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt.setName("고정").setDescription("공지를 상단에 고정할지 여부").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("목록").setDescription("최근 공지 목록을 확인합니다.")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: {},
    create: { discordId: guildDiscordId, name: interaction.guild!.name },
  });

  if (sub === "작성") {
    await interaction.deferReply();
    const title = interaction.options.getString("제목", true);
    const content = interaction.options.getString("내용", true);
    const pinned = interaction.options.getBoolean("고정") ?? false;

    await prisma.announcement.create({
      data: {
        guildId: guild.id,
        title,
        content,
        authorId: interaction.user.id,
        pinned,
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${pinned ? "📌 " : "📢 "}${title}`)
      .setDescription(content)
      .setFooter({ text: `작성자: ${interaction.user.displayName}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // 알림 채널에도 전송
    const guildData = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
    if (guildData?.notifyChannelId) {
      const channel = interaction.guild?.channels.cache.get(guildData.notifyChannelId);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    }

  } else if (sub === "목록") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const announcements = await prisma.announcement.findMany({
      where: { guildId: guild.id },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 5,
    });

    if (!announcements.length) {
      return interaction.editReply("📋 아직 공지가 없어요.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("📋 최근 공지");

    for (const a of announcements) {
      embed.addFields({
        name: `${a.pinned ? "📌 " : ""}${a.title}`,
        value: a.content.length > 100 ? a.content.slice(0, 100) + "..." : a.content,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
