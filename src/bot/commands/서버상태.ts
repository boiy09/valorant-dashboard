import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  getQueueStatus,
  getValorantStatus,
  type ValorantRegion,
} from "../../lib/valorant";

const regionChoices: Array<{ name: string; value: ValorantRegion }> = [
  { name: "한국", value: "kr" },
  { name: "아시아태평양", value: "ap" },
  { name: "북미", value: "na" },
  { name: "유럽", value: "eu" },
];

export const data = new SlashCommandBuilder()
  .setName("서버상태")
  .setDescription("발로란트 서버와 큐 상태를 확인합니다.")
  .addSubcommand((subcommand) => {
    const option = subcommand
      .setName("상태")
      .setDescription("점검 또는 장애 여부를 확인합니다.")
      .addStringOption((opt) => {
        opt.setName("지역").setDescription("조회할 지역").setRequired(false);
        for (const choice of regionChoices) {
          opt.addChoices({ name: choice.name, value: choice.value });
        }
        return opt;
      });

    return option;
  })
  .addSubcommand((subcommand) => {
    const option = subcommand
      .setName("큐")
      .setDescription("현재 활성화된 큐와 경쟁전 맵 풀을 확인합니다.")
      .addStringOption((opt) => {
        opt.setName("지역").setDescription("조회할 지역").setRequired(false);
        for (const choice of regionChoices) {
          opt.addChoices({ name: choice.name, value: choice.value });
        }
        return opt;
      });

    return option;
  });

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();
  const region = (interaction.options.getString("지역") as ValorantRegion | null) ?? "kr";
  const regionLabel = regionChoices.find((choice) => choice.value === region)?.name ?? region;

  try {
    if (subcommand === "상태") {
      const status = await getValorantStatus(region);
      const isHealthy = status.maintenances.length === 0 && status.incidents.length === 0;

      const embed = new EmbedBuilder()
        .setColor(isHealthy ? 0x22c55e : 0xff4655)
        .setTitle(`${regionLabel} 서버 상태`)
        .addFields(
          {
            name: "현재 상태",
            value: isHealthy ? "정상" : "확인 필요",
            inline: true,
          },
          {
            name: "점검",
            value: `${status.maintenances.length}건`,
            inline: true,
          },
          {
            name: "장애",
            value: `${status.incidents.length}건`,
            inline: true,
          }
        )
        .setFooter({ text: "Valorant Dashboard" })
        .setTimestamp();

      if (!isHealthy) {
        embed.addFields({
          name: "최근 이슈",
          value: [...status.maintenances, ...status.incidents]
            .slice(0, 5)
            .map((item) => `• ${item.title}`)
            .join("\n"),
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const queues = await getQueueStatus(region);
    const enabledQueues = queues.filter((queue) => queue.enabled);
    const competitiveQueue =
      enabledQueues.find((queue) => queue.modeId === "competitive") ??
      enabledQueues.find((queue) => queue.ranked);

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${regionLabel} 큐 상태`)
      .addFields(
        {
          name: "활성 큐",
          value: enabledQueues.slice(0, 8).map((queue) => queue.mode).join(", ") || "정보 없음",
        },
        {
          name: "경쟁전 맵 풀",
          value: competitiveQueue?.maps.join(", ") || "정보 없음",
        }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.editReply("서버 상태를 불러오는 중 오류가 났어요.");
  }
}
