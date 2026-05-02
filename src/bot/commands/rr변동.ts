import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getMmrHistoryByRiotId, parseRiotId } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("rr변동")
  .setDescription("최근 경쟁전 RR 변동을 보여줍니다.")
  .addStringOption((option) =>
    option
      .setName("라이엇아이디")
      .setDescription("예: 플레이어#KR1")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("최근 몇 판을 볼지 선택합니다. 기본 5, 최대 10")
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
    const { profile, history } = await getMmrHistoryByRiotId(
      riotId.gameName,
      riotId.tagLine,
      count
    );

    if (!history.length) {
      return interaction.editReply("RR 변동 내역을 아직 찾지 못했어요.");
    }

    const netRr = history.reduce((sum, entry) => sum + entry.rrChange, 0);

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} 최근 RR 변동`)
      .setDescription(
        history
          .map((entry, index) => {
            const diff = entry.rrChange > 0 ? `+${entry.rrChange}` : `${entry.rrChange}`;
            const date = entry.playedAt.toLocaleDateString("ko-KR");
            return `${index + 1}. **${entry.map}** · ${entry.tierName} ${entry.rr}RR · ${diff}RR · ${date}`;
          })
          .join("\n")
      )
      .addFields({
        name: "최근 누적 RR",
        value: `${netRr > 0 ? "+" : ""}${netRr} RR`,
        inline: true,
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
    await interaction.editReply("RR 변동을 불러오는 중 오류가 났어요.");
  }
}
