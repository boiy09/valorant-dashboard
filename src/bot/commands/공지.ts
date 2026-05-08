import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { prisma } from "../../lib/prisma";

function normalizeAnnouncementContent(content: string) {
  return content.replace(/\\n/g, "\n").trim();
}

export const data = new SlashCommandBuilder()
  .setName("공지")
  .setDescription("공지를 관리합니다.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("작성")
      .setDescription("새 공지를 작성합니다. 줄바꿈은 \\n 또는 붙여넣은 줄바꿈을 사용할 수 있습니다.")
      .addStringOption((opt) =>
        opt.setName("제목").setDescription("공지 제목").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("내용").setDescription("공지 내용. 줄바꿈은 \\n 으로 입력할 수 있습니다.").setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt.setName("고정").setDescription("공지를 상단에 고정할지 여부").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("목록").setDescription("최근 공지 목록과 삭제용 ID를 확인합니다.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("삭제")
      .setDescription("공지 ID로 공지를 삭제합니다.")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("/공지 목록에 표시된 공지 ID").setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildDiscordId = interaction.guildId!;

  const guild = await prisma.guild.upsert({
    where: { discordId: guildDiscordId },
    update: { name: interaction.guild?.name },
    create: { discordId: guildDiscordId, name: interaction.guild?.name ?? "Discord Server" },
  });

  if (sub === "작성") {
    await interaction.deferReply();
    const title = interaction.options.getString("제목", true).trim();
    const content = normalizeAnnouncementContent(interaction.options.getString("내용", true));
    const pinned = interaction.options.getBoolean("고정") ?? false;

    if (!title || !content) {
      await interaction.editReply("제목과 내용은 비워둘 수 없습니다.");
      return;
    }

    const announcement = await prisma.announcement.create({
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
      .setFooter({ text: `ID: ${announcement.id} · 작성자: ${interaction.user.displayName}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const guildData = await prisma.guild.findUnique({ where: { discordId: guildDiscordId } });
    if (guildData?.notifyChannelId) {
      const channel = interaction.guild?.channels.cache.get(guildData.notifyChannelId);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    }

    return;
  }

  if (sub === "목록") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const announcements = await prisma.announcement.findMany({
      where: { guildId: guild.id },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 10,
    });

    if (!announcements.length) {
      await interaction.editReply("아직 공지가 없습니다.");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("최근 공지");

    for (const announcement of announcements) {
      const preview = announcement.content.length > 120
        ? `${announcement.content.slice(0, 120)}...`
        : announcement.content;

      embed.addFields({
        name: `${announcement.pinned ? "📌 " : ""}${announcement.title}`,
        value: `ID: \`${announcement.id}\`\n${preview}`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "삭제") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString("id", true).trim();

    const deleted = await prisma.announcement.deleteMany({
      where: { id, guildId: guild.id },
    });

    if (deleted.count === 0) {
      await interaction.editReply("해당 ID의 공지를 찾지 못했습니다. /공지 목록에서 ID를 다시 확인하세요.");
      return;
    }

    await interaction.editReply("공지를 삭제했습니다.");
  }
}
