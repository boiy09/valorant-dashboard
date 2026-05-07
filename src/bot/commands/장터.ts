import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";

const CATEGORY_CHOICES = [
  { name: "계정", value: "계정" },
  { name: "코인", value: "코인" },
  { name: "아이템", value: "아이템" },
  { name: "기타", value: "기타" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  sale: "거래 가능",
  reserved: "예약 중",
  sold: "거래 완료",
};

export const data = new SlashCommandBuilder()
  .setName("장터")
  .setDescription("장터 게시글을 등록하고 관리합니다.")
  .addSubcommand((sub) =>
    sub
      .setName("등록")
      .setDescription("장터에 새 게시글을 등록합니다.")
      .addStringOption((option) =>
        option.setName("제목").setDescription("게시글 제목").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("설명").setDescription("거래 설명").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("분류")
          .setDescription("게시글 분류")
          .setRequired(true)
          .addChoices(...CATEGORY_CHOICES)
      )
      .addIntegerOption((option) =>
        option.setName("가격").setDescription("가격. 비우면 무료/협의로 표시됩니다.").setRequired(false)
      )
      .addStringOption((option) =>
        option.setName("이미지").setDescription("이미지 URL").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("목록")
      .setDescription("최근 장터 게시글을 확인합니다.")
      .addStringOption((option) =>
        option
          .setName("분류")
          .setDescription("조회할 분류")
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("예약")
      .setDescription("내 게시글을 예약 중으로 바꿉니다.")
      .addStringOption((option) =>
        option.setName("id").setDescription("게시글 ID 마지막 8자리").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("완료")
      .setDescription("내 게시글을 거래 완료로 바꿉니다.")
      .addStringOption((option) =>
        option.setName("id").setDescription("게시글 ID 마지막 8자리").setRequired(true)
      )
  );

async function getContext(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) return null;

  const guild = await prisma.guild.upsert({
    where: { discordId: interaction.guildId },
    update: { name: interaction.guild.name },
    create: { discordId: interaction.guildId, name: interaction.guild.name },
  });

  const email = `${interaction.user.id}@discord`;
  const user = await prisma.user.upsert({
    where: { discordId: interaction.user.id },
    update: {
      name: interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.displayName,
      image: interaction.user.displayAvatarURL(),
    },
    create: {
      discordId: interaction.user.id,
      email,
      name: interaction.user.displayName,
      image: interaction.user.displayAvatarURL(),
    },
  });

  return { guild, user };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const context = await getContext(interaction);

  if (!context) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  if (subcommand === "등록") {
    await interaction.deferReply();

    const title = interaction.options.getString("제목", true);
    const description = interaction.options.getString("설명", true);
    const category = interaction.options.getString("분류", true);
    const price = interaction.options.getInteger("가격");
    const imageUrl = interaction.options.getString("이미지") ?? undefined;

    const post = await prisma.marketPost.create({
      data: {
        guildId: context.guild.id,
        userId: context.user.id,
        title,
        description,
        category,
        price,
        imageUrl,
        status: "sale",
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("장터 등록")
      .setDescription(description)
      .addFields(
        { name: "제목", value: title, inline: true },
        { name: "분류", value: category, inline: true },
        { name: "가격", value: price === null ? "무료/협의" : `${price.toLocaleString()}P`, inline: true },
        { name: "ID", value: `\`${post.id.slice(-8)}\``, inline: true }
      );

    if (imageUrl) embed.setImage(imageUrl);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "목록") {
    await interaction.deferReply({ ephemeral: true });

    const category = interaction.options.getString("분류");
    const posts = await prisma.marketPost.findMany({
      where: {
        guildId: context.guild.id,
        status: { in: ["sale", "reserved"] },
        ...(category ? { category } : {}),
      },
      include: { user: { select: { name: true, discordId: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (!posts.length) {
      await interaction.editReply("등록된 장터 게시글이 없습니다.");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle("최근 장터 게시글")
      .setDescription(
        posts
          .map((post) => {
            const seller = post.user.discordId ? `<@${post.user.discordId}>` : post.user.name ?? "알 수 없음";
            const price = post.price === null ? "무료/협의" : `${post.price.toLocaleString()}P`;
            return `**${post.title}** [${post.category}] ${price}\n${STATUS_LABEL[post.status] ?? post.status} · ${seller}\nID: \`${post.id.slice(-8)}\``;
          })
          .join("\n\n")
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "예약" || subcommand === "완료") {
    await interaction.deferReply({ ephemeral: true });

    const shortId = interaction.options.getString("id", true);
    const post = await prisma.marketPost.findFirst({
      where: { guildId: context.guild.id, id: { endsWith: shortId } },
    });

    if (!post) {
      await interaction.editReply("해당 ID의 장터 게시글을 찾을 수 없습니다.");
      return;
    }

    if (post.userId !== context.user.id) {
      await interaction.editReply("본인이 등록한 게시글만 변경할 수 있습니다.");
      return;
    }

    const status = subcommand === "예약" ? "reserved" : "sold";
    await prisma.marketPost.update({
      where: { id: post.id },
      data: { status, updatedAt: new Date() },
    });

    await interaction.editReply(`**${post.title}** 상태를 ${STATUS_LABEL[status]}로 변경했습니다.`);
  }
}
