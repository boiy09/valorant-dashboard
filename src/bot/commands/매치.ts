import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerByRiotId, getRecentMatches, parseRiotId } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("매치")
  .setDescription("최근 매치 기록을 조회합니다.")
  .addStringOption((option) =>
    option
      .setName("라이엇아이디")
      .setDescription("예: 플레이어#KR1")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("조회할 경기 수 (기본 5, 최대 10)")
      .setMinValue(1)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const input = interaction.options.getString("라이엇아이디", true);
  const count = interaction.options.getInteger("개수") ?? 5;
  const riotId = parseRiotId(input);

  if (!riotId) {
    return interaction.editReply("라이엇 아이디 형식이 잘못됐어요. 예: `플레이어#KR1`");
  }

  try {
    const profile = await getPlayerByRiotId(riotId.gameName, riotId.tagLine);
    const matches = await getRecentMatches(profile.puuid, count);

    if (!matches.length) {
      return interaction.editReply("최근 매치 기록이 아직 없어요.");
    }

    const wins = matches.filter((match) => match.result === "승리").length;
    const totalKills = matches.reduce((sum, match) => sum + match.kills, 0);
    const totalDeaths = matches.reduce((sum, match) => sum + match.deaths, 0);
    const totalAssists = matches.reduce((sum, match) => sum + match.assists, 0);
    const totalShots = matches.reduce(
      (sum, match) => sum + match.headshots + match.bodyshots + match.legshots,
      0
    );
    const totalHeadshots = matches.reduce((sum, match) => sum + match.headshots, 0);
    const headshotRate = totalShots > 0 ? Math.round((totalHeadshots / totalShots) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} 최근 ${matches.length}경기`)
      .addFields(
        {
          name: "전적",
          value: `${wins}승 ${matches.length - wins}패`,
          inline: true,
        },
        {
          name: "평균 KDA",
          value: `${(totalKills / matches.length).toFixed(1)}/${(totalDeaths / matches.length).toFixed(1)}/${(totalAssists / matches.length).toFixed(1)}`,
          inline: true,
        },
        {
          name: "평균 헤드샷률",
          value: `${headshotRate}%`,
          inline: true,
        }
      )
      .addFields({
        name: "매치 목록",
        value: matches
          .map((match, index) => {
            const result =
              match.result === "승리" ? "승" : match.result === "패배" ? "패" : "무";
            const date = match.playedAt.toLocaleDateString("ko-KR");
            return `${index + 1}. ${result} · **${match.agent}** · ${match.map} · ${match.kills}/${match.deaths}/${match.assists} · ${date}`;
          })
          .join("\n"),
      })
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("해당 플레이어를 찾지 못했어요.");
      return;
    }

    console.error(error);
    await interaction.editReply("최근 매치를 불러오는 중 오류가 났어요.");
  }
}
