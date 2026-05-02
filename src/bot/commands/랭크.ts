import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerByRiotId, getRankByPuuid, parseRiotId } from "../../lib/valorant";

export const data = new SlashCommandBuilder()
  .setName("랭크")
  .setDescription("현재 경쟁전 랭크를 조회합니다.")
  .addStringOption((option) =>
    option
      .setName("라이엇아이디")
      .setDescription("예: 플레이어#KR1")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const input = interaction.options.getString("라이엇아이디", true);
  const riotId = parseRiotId(input);

  if (!riotId) {
    return interaction.editReply("라이엇 아이디 형식이 잘못됐어요. 예: `플레이어#KR1`");
  }

  try {
    const profile = await getPlayerByRiotId(riotId.gameName, riotId.tagLine);
    const rank = await getRankByPuuid(profile.puuid);

    if (!rank) {
      return interaction.editReply("랭크 정보를 아직 찾지 못했어요. 배치 전이거나 API 응답이 비어 있을 수 있어요.");
    }

    const losses = Math.max(rank.games - rank.wins, 0);
    const winRate = rank.games > 0 ? Math.round((rank.wins / rank.games) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} 랭크`)
      .setThumbnail(profile.card ?? null)
      .addFields(
        {
          name: "현재 티어",
          value: rank.tierName,
          inline: true,
        },
        {
          name: "현재 RR",
          value: `${rank.rr} RR`,
          inline: true,
        },
        {
          name: "최고 티어",
          value: rank.peakTierName,
          inline: true,
        },
        {
          name: "전체 전적",
          value: `${rank.wins}승 ${losses}패`,
          inline: true,
        },
        {
          name: "승률",
          value: `${winRate}%`,
          inline: true,
        },
        {
          name: "랭크 경기 수",
          value: `${rank.games}판`,
          inline: true,
        }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("해당 플레이어를 찾지 못했어요.");
      return;
    }

    console.error(error);
    await interaction.editReply("랭크 정보를 불러오는 중 오류가 났어요.");
  }
}
