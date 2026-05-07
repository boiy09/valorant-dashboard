import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? process.env.NEXTAUTH_URL ?? "https://valorant-dashboard-henna.vercel.app";

export const data = new SlashCommandBuilder()
  .setName("발로세끼")
  .setDescription("발로세끼 웹 대시보드 주소를 안내합니다.");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle("발로세끼 대시보드")
    .setDescription(`[웹 대시보드 바로가기](${DASHBOARD_URL})`)
    .setFooter({ text: "라이엇 연동, 전적, 일정, 장터, 하이라이트를 웹에서 확인할 수 있습니다." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("웹사이트 열기")
      .setStyle(ButtonStyle.Link)
      .setURL(DASHBOARD_URL)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
