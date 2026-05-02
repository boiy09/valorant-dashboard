import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { getPlayerByRiotId, getRankByPuuid } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("랭크")
  .setDescription("현재 랭크를 조회합니다.")
  .addStringOption((opt) =>
    opt.setName("닉네임").setDescription("라이엇 닉네임#태그 (예: 플레이어#KR1)").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const input = interaction.options.getString("닉네임", true);
  const [gameName, tagLine] = input.split("#");

  if (!gameName || !tagLine) {
    return interaction.editReply("❌ 닉네임 형식이 올바르지 않아요. 예시: `플레이어#KR1`");
  }

  try {
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const rank = await getRankByPuuid(profile.puuid);

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} — 랭크 정보`)
      .setThumbnail(profile.card ?? null)
      .addFields(
        { name: "🎖️ 현재 티어", value: rank?.tierName ?? "언랭크", inline: true },
        { name: "🔢 랭크 포인트", value: `${rank?.rr ?? 0} RR`, inline: true },
        { name: "💎 최고 티어", value: rank?.peakTierName ?? "없음", inline: true },
        {
          name: "📈 승/패",
          value: rank ? `${rank.wins}승 ${rank.games - rank.wins}패` : "N/A",
          inline: true,
        },
        {
          name: "🏆 승률",
          value: rank && rank.games > 0 ? `${Math.round((rank.wins / rank.games) * 100)}%` : "N/A",
          inline: true,
        }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("❌ 해당 플레이어를 찾을 수 없어요.");
    } else {
      console.error(error);
      await interaction.editReply("❌ 랭크 조회 중 오류가 발생했어요.");
    }
  }
}
