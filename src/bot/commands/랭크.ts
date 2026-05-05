import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerByRiotId, getRankByPuuid } from "../../lib/valorant";
import { resolveRiotTarget } from "../utils/linkedRiotAccount";

function regionLabel(region: "KR" | "AP") {
  return region === "AP" ? "아섭(AP)" : "한섭(KR)";
}

export const data = new SlashCommandBuilder()
  .setName("랭크")
  .setDescription("현재 경쟁전 랭크를 조회합니다.")
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
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const resolved = await resolveRiotTarget(interaction);
  if (!resolved.ok) {
    return interaction.editReply(resolved.message);
  }

  try {
    const profile = await getPlayerByRiotId(
      resolved.target.gameName,
      resolved.target.tagLine
    );
    const rank = await getRankByPuuid(
      profile.puuid,
      resolved.target.region === "AP" ? "ap" : "kr"
    );

    if (!rank) {
      return interaction.editReply(
        "랭크 정보를 아직 찾지 못했습니다. 배치 전이거나 API 응답이 비어 있을 수 있습니다."
      );
    }

    const losses = Math.max(rank.games - rank.wins, 0);
    const winRate = rank.games > 0 ? Math.round((rank.wins / rank.games) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine} 랭크`)
      .setDescription(`${regionLabel(resolved.target.region)} 계정 기준 랭크`)
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
          value: `${rank.games}경기`,
          inline: true,
        }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("해당 플레이어를 찾지 못했습니다.");
      return;
    }

    console.error(`랭크 명령 오류 [${interaction.user.id}]:`, error);
    await interaction.editReply("랭크 정보를 불러오는 중 오류가 발생했습니다.");
  }
}
