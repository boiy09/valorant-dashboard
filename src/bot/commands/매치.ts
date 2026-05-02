import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { getPlayerByRiotId, getRecentMatches } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("매치")
  .setDescription("최근 매치 히스토리를 조회합니다.")
  .addStringOption((opt) =>
    opt.setName("닉네임").setDescription("라이엇 닉네임#태그 (예: 플레이어#KR1)").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("개수").setDescription("조회할 매치 수 (기본: 5, 최대: 10)").setMinValue(1).setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const input = interaction.options.getString("닉네임", true);
  const count = interaction.options.getInteger("개수") ?? 5;
  const [gameName, tagLine] = input.split("#");

  if (!gameName || !tagLine) {
    return interaction.editReply("❌ 닉네임 형식이 올바르지 않아요. 예시: `플레이어#KR1`");
  }

  try {
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const matches = await getRecentMatches(profile.puuid, count);

    if (matches.length === 0) {
      return interaction.editReply("❌ 최근 매치 기록이 없어요.");
    }

    const totalKills = matches.reduce((s, m) => s + m.kills, 0);
    const totalDeaths = matches.reduce((s, m) => s + m.deaths, 0);
    const totalAssists = matches.reduce((s, m) => s + m.assists, 0);
    const wins = matches.filter((m) => m.result === "승리").length;
    const totalShots = matches.reduce((s, m) => s + m.headshots + m.bodyshots + m.legshots, 0);
    const totalHS = matches.reduce((s, m) => s + m.headshots, 0);
    const hsRate = totalShots > 0 ? Math.round((totalHS / totalShots) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} — 최근 ${matches.length}경기`)
      .addFields(
        { name: "🏆 승/패", value: `${wins}승 ${matches.length - wins}패`, inline: true },
        {
          name: "⚔️ 평균 KDA",
          value: `${(totalKills / matches.length).toFixed(1)}/${(totalDeaths / matches.length).toFixed(1)}/${(totalAssists / matches.length).toFixed(1)}`,
          inline: true,
        },
        { name: "🎯 헤드샷율", value: `${hsRate}%`, inline: true }
      );

    const matchLines = matches.map((m, i) => {
      const icon = m.result === "승리" ? "✅" : "❌";
      const time = m.playedAt.toLocaleDateString("ko-KR");
      return `${i + 1}. ${icon} **${m.agent}** | ${m.map} | ${m.kills}/${m.deaths}/${m.assists} | ${time}`;
    });

    embed.addFields({ name: "📋 매치 목록", value: matchLines.join("\n") });
    embed.setFooter({ text: "Valorant Dashboard" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("❌ 해당 플레이어를 찾을 수 없어요.");
    } else {
      console.error(error);
      await interaction.editReply("❌ 매치 조회 중 오류가 발생했어요.");
    }
  }
}
