import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getLeaderboard, type ValorantRegion } from "../../lib/valorant";

const regionChoices: Array<{ name: string; value: ValorantRegion }> = [
  { name: "한국", value: "kr" },
  { name: "아시아태평양", value: "ap" },
  { name: "북미", value: "na" },
  { name: "유럽", value: "eu" },
];

export const data = new SlashCommandBuilder()
  .setName("리더보드")
  .setDescription("발로란트 경쟁전 상위 랭커를 조회합니다.")
  .addStringOption((option) => {
    option
      .setName("지역")
      .setDescription("조회할 지역")
      .setRequired(false);

    for (const choice of regionChoices) {
      option.addChoices({ name: choice.name, value: choice.value });
    }

    return option;
  })
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("표시할 인원 수 (기본 10)")
      .setMinValue(3)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const region = (interaction.options.getString("지역") as ValorantRegion | null) ?? "kr";
  const count = interaction.options.getInteger("개수") ?? 10;

  try {
    const players = await getLeaderboard(region, "pc", count);

    if (!players.length) {
      return interaction.editReply("리더보드 데이터를 가져오지 못했어요.");
    }

    const regionLabel = regionChoices.find((choice) => choice.value === region)?.name ?? region;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${regionLabel} 경쟁전 리더보드`)
      .setDescription(
        players
          .map((player) => {
            const riotId = player.tagLine ? `${player.gameName}#${player.tagLine}` : player.gameName;
            return `#${player.rank} **${riotId}** · ${player.rr}RR · ${player.wins}승`;
          })
          .join("\n")
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.editReply("리더보드를 불러오는 중 오류가 났어요.");
  }
}
