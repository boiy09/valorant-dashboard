import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  findAgentByName,
  findMapByName,
  getValorantContent,
} from "../../lib/valorant";

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export const data = new SlashCommandBuilder()
  .setName("발로정보")
  .setDescription("맵, 요원, 현재 액트 같은 기본 정보를 확인합니다.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("버전")
      .setDescription("현재 게임 버전을 확인합니다.")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("액트")
      .setDescription("현재 에피소드와 액트를 확인합니다.")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("요원")
      .setDescription("특정 요원 또는 전체 요원 목록을 확인합니다.")
      .addStringOption((option) =>
        option
          .setName("이름")
          .setDescription("요원 이름. 비우면 전체 목록을 보여줍니다.")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("맵")
      .setDescription("특정 맵 또는 전체 맵 목록을 확인합니다.")
      .addStringOption((option) =>
        option
          .setName("이름")
          .setDescription("맵 이름. 비우면 전체 목록을 보여줍니다.")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("랜덤요원")
      .setDescription("랜덤 요원을 추천합니다.")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("랜덤맵")
      .setDescription("랜덤 맵을 추천합니다.")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();

  try {
    const content = await getValorantContent("ko-KR");

    if (subcommand === "버전") {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle("현재 게임 버전")
            .setDescription(content.version)
            .setFooter({ text: "Valorant Dashboard" })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (subcommand === "액트") {
      const activeActs = content.acts.filter((act) => act.isActive);
      const episode = activeActs.find((act) => act.type === "episode");
      const currentAct = activeActs.find((act) => act.type === "act");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle("현재 시즌 정보")
            .addFields(
              {
                name: "에피소드",
                value: episode?.name ?? "정보 없음",
                inline: true,
              },
              {
                name: "액트",
                value: currentAct?.name ?? "정보 없음",
                inline: true,
              }
            )
            .setFooter({ text: "Valorant Dashboard" })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (subcommand === "요원") {
      const input = interaction.options.getString("이름");
      if (!input) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff4655)
              .setTitle(`요원 목록 (${content.agents.length})`)
              .setDescription(content.agents.map((agent) => agent.name).join(", "))
              .setFooter({ text: "Valorant Dashboard" })
              .setTimestamp(),
          ],
        });
        return;
      }

      const agent = await findAgentByName(input, "ko-KR");
      if (!agent) {
        return interaction.editReply("해당 이름의 요원을 찾지 못했어요.");
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle(`${agent.name} 정보`)
            .addFields(
              { name: "표시 이름", value: agent.name, inline: true },
              { name: "내부 이름", value: agent.assetName || "정보 없음", inline: true }
            )
            .setFooter({ text: "Valorant Dashboard" })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (subcommand === "맵") {
      const input = interaction.options.getString("이름");
      if (!input) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff4655)
              .setTitle(`맵 목록 (${content.maps.length})`)
              .setDescription(content.maps.map((map) => map.name).join(", "))
              .setFooter({ text: "Valorant Dashboard" })
              .setTimestamp(),
          ],
        });
        return;
      }

      const map = await findMapByName(input, "ko-KR");
      if (!map) {
        return interaction.editReply("해당 이름의 맵을 찾지 못했어요.");
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle(`${map.name} 정보`)
            .addFields(
              { name: "표시 이름", value: map.name, inline: true },
              { name: "내부 이름", value: map.assetName || "정보 없음", inline: true }
            )
            .setFooter({ text: "Valorant Dashboard" })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (subcommand === "랜덤요원") {
      const agent = pickRandom(content.agents);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4655)
            .setTitle("랜덤 요원 추천")
            .setDescription(`이번 판은 **${agent.name}** 어때요?`)
            .setFooter({ text: "Valorant Dashboard" })
            .setTimestamp(),
        ],
      });
      return;
    }

    const map = pickRandom(content.maps);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4655)
          .setTitle("랜덤 맵 추천")
          .setDescription(`이번 판 맵은 **${map.name}**`)
          .setFooter({ text: "Valorant Dashboard" })
          .setTimestamp(),
      ],
    });
  } catch (error) {
    console.error(error);
    await interaction.editReply("발로란트 정보를 불러오는 중 오류가 났어요.");
  }
}
