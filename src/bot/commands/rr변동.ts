import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getMmrHistoryByRiotId } from "../../lib/valorant";
import { resolveRiotTarget } from "../utils/linkedRiotAccount";

function regionLabel(region: "KR" | "AP") {
  return region === "AP" ? "아섭(AP)" : "한섭(KR)";
}

export const data = new SlashCommandBuilder()
  .setName("rr변동")
  .setDescription("최근 경쟁전 RR 변동을 보여줍니다.")
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
      .setDescription("최근 몇 경기를 볼지 선택합니다. 기본 5, 최대 10")
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
    const { profile, history } = await getMmrHistoryByRiotId(
      resolved.target.gameName,
      resolved.target.tagLine,
      count,
      resolved.target.region === "AP" ? "ap" : "kr"
    );

    if (!history.length) {
      return interaction.editReply("RR 변동 내역을 아직 찾지 못했습니다.");
    }

    const netRr = history.reduce((sum, entry) => sum + entry.rrChange, 0);

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} 최근 RR 변동`)
      .addFields({
        name: "조회 기준",
        value: regionLabel(resolved.target.region),
        inline: true,
      })
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
      await interaction.editReply("해당 플레이어를 찾지 못했습니다.");
      return;
    }

    console.error(`RR 변동 명령 오류 [${interaction.user.id}]:`, error);
    await interaction.editReply("RR 변동 내역을 불러오는 중 오류가 발생했습니다.");
  }
}
