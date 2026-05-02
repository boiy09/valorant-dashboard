import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getVctSchedule } from "../../lib/valorant";

const leagueChoices = [
  { name: "VCT Pacific", value: "vct_pacific" },
  { name: "VCT Americas", value: "vct_americas" },
  { name: "VCT EMEA", value: "vct_emea" },
  { name: "Challengers KR", value: "challengers_kr" },
  { name: "Game Changers KR", value: "game_changers_kr" },
];

export const data = new SlashCommandBuilder()
  .setName("vct일정")
  .setDescription("VCT 또는 챌린저스 일정을 조회합니다.")
  .addStringOption((option) => {
    option
      .setName("리그")
      .setDescription("조회할 리그")
      .setRequired(false);

    for (const choice of leagueChoices) {
      option.addChoices({ name: choice.name, value: choice.value });
    }

    return option;
  })
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("표시할 경기 수 (기본 5)")
      .setMinValue(1)
      .setMaxValue(5)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const league = interaction.options.getString("리그") ?? "vct_pacific";
  const count = interaction.options.getInteger("개수") ?? 5;

  try {
    const matches = await getVctSchedule(league, 20);
    const now = Date.now();
    const upcoming = matches
      .filter((match) => match.startsAt.getTime() >= now)
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
      .slice(0, count);
    const targetMatches = upcoming.length
      ? upcoming
      : matches.slice(0, count);

    if (!targetMatches.length) {
      return interaction.editReply("해당 리그 일정이 아직 없어요.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${targetMatches[0].leagueName} 일정`)
      .setDescription(
        targetMatches
          .map((match) => {
            const date = match.startsAt.toLocaleString("ko-KR");
            return `**${match.teamOne} vs ${match.teamTwo}**\n${match.tournamentName} · ${match.state} · ${date} · ${match.score}`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 400) {
      await interaction.editReply("해당 리그 일정을 찾지 못했어요.");
      return;
    }

    console.error(error);
    await interaction.editReply("VCT 일정을 불러오는 중 오류가 났어요.");
  }
}
