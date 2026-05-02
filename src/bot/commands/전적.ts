import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { getPlayerStats } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("전적")
  .setDescription("발로란트 전적을 조회합니다.")
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
    const { profile, rank, recentMatches } = await getPlayerStats(gameName, tagLine);

    const kda =
      recentMatches.length > 0
        ? (
            recentMatches.reduce((s, m) => s + (m.kills + m.assists) / Math.max(m.deaths, 1), 0) /
            recentMatches.length
          ).toFixed(2)
        : "N/A";

    const winRate =
      recentMatches.length > 0
        ? Math.round((recentMatches.filter((m) => m.result === "승리").length / recentMatches.length) * 100)
        : 0;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine}`)
      .setThumbnail(profile.card ?? null)
      .addFields(
        { name: "🎖️ 현재 랭크", value: rank?.tierName ?? "언랭크", inline: true },
        { name: "💎 최고 랭크", value: rank?.peakTierName ?? "없음", inline: true },
        { name: "🔢 RR", value: `${rank?.rr ?? 0} RR`, inline: true },
        { name: "📊 최근 5경기 KDA", value: kda, inline: true },
        { name: "🏆 최근 5경기 승률", value: `${winRate}%`, inline: true },
        { name: "⚡ 레벨", value: `${profile.accountLevel}`, inline: true }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    const matchList = recentMatches
      .slice(0, 5)
      .map(
        (m) =>
          `${m.result === "승리" ? "✅" : "❌"} **${m.agent}** | ${m.map} | ${m.kills}/${m.deaths}/${m.assists}`
      )
      .join("\n");

    if (matchList) {
      embed.addFields({ name: "🗓️ 최근 매치", value: matchList });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("❌ 해당 플레이어를 찾을 수 없어요. 닉네임과 태그를 확인해주세요.");
    } else {
      console.error(error);
      await interaction.editReply("❌ 전적 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
    }
  }
}
