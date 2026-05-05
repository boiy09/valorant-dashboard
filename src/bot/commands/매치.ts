import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerByRiotId, getRecentMatches } from "../../lib/valorant";
import { resolveRiotTarget } from "../utils/linkedRiotAccount";

function regionLabel(region: "KR" | "AP") {
  return region === "AP" ? "아섭(AP)" : "한섭(KR)";
}

function resultEmoji(result: string) {
  if (result === "승리") return "✅";
  if (result === "패배") return "❌";
  return "➖";
}

export const data = new SlashCommandBuilder()
  .setName("매치")
  .setDescription("최근 매치 기록을 조회합니다.")
  .addStringOption((option) =>
    option
      .setName("라이엇아이디")
      .setDescription("예: Player#KR1")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("지역")
      .setDescription("연결된 KR/AP 계정 중 어느 쪽을 조회할지 선택합니다.")
      .addChoices(
        { name: "한섭(KR)", value: "KR" },
        { name: "아섭(AP)", value: "AP" }
      )
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("조회할 경기 수입니다. 기본 5, 최대 10")
      .setMinValue(1)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const count = interaction.options.getInteger("개수") ?? 5;
  const resolved = await resolveRiotTarget(interaction);
  if (!resolved.ok) {
    return interaction.editReply(resolved.message);
  }

  try {
    const profile = await getPlayerByRiotId(
      resolved.target.gameName,
      resolved.target.tagLine
    );
    const matches = await getRecentMatches(
      profile.puuid,
      count,
      resolved.target.region === "AP" ? "ap" : "kr"
    );

    if (!matches.length) {
      return interaction.editReply("최근 매치 기록이 아직 없습니다.");
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
      .setDescription(`${regionLabel(resolved.target.region)} 계정 기준 매치 기록`)
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
            const date = match.playedAt.toLocaleDateString("ko-KR");
            return `${index + 1}. ${resultEmoji(match.result)} **${match.agent}** · ${match.map} · ${match.kills}/${match.deaths}/${match.assists} · ${date}`;
          })
          .join("\n"),
      })
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("해당 플레이어를 찾지 못했습니다.");
      return;
    }

    console.error(`매치 명령 오류 [${interaction.user.id}]:`, error);
    await interaction.editReply("최근 매치를 불러오는 중 오류가 발생했습니다.");
  }
}
