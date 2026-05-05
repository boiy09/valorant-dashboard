import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPlayerStats } from "../../lib/valorant";
import { resolveRiotTarget } from "../utils/linkedRiotAccount";

function average(numbers: number[]) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function regionLabel(region: "KR" | "AP") {
  return region === "AP" ? "아섭(AP)" : "한섭(KR)";
}

function resultEmoji(result: string) {
  if (result === "승리") return "✅";
  if (result === "패배") return "❌";
  return "➖";
}

export const data = new SlashCommandBuilder()
  .setName("전적")
  .setDescription("발로란트 기본 전적을 조회합니다.")
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
    const { profile, rank, recentMatches } = await getPlayerStats(
      resolved.target.gameName,
      resolved.target.tagLine,
      resolved.target.region === "AP" ? "ap" : "kr"
    );

    const wins = recentMatches.filter((match) => match.result === "승리").length;
    const kdaValues = recentMatches.map(
      (match) => (match.kills + match.assists) / Math.max(match.deaths, 1)
    );
    const hsValues = recentMatches.map((match) => {
      const total = match.headshots + match.bodyshots + match.legshots;
      return total > 0 ? (match.headshots / total) * 100 : 0;
    });

    const topAgent =
      recentMatches
        .map((match) => match.agent)
        .sort(
          (left, right) =>
            recentMatches.filter((match) => match.agent === right).length -
            recentMatches.filter((match) => match.agent === left).length
        )[0] ?? "정보 없음";

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`${profile.gameName}#${profile.tagLine}`)
      .setDescription(`${regionLabel(resolved.target.region)} 계정 기준 전적`)
      .setThumbnail(profile.card ?? null)
      .addFields(
        {
          name: "현재 랭크",
          value: rank?.tierName ?? "언랭크",
          inline: true,
        },
        {
          name: "현재 RR",
          value: rank ? `${rank.rr} RR` : "정보 없음",
          inline: true,
        },
        {
          name: "최고 랭크",
          value: rank?.peakTierName ?? "정보 없음",
          inline: true,
        },
        {
          name: "계정 레벨",
          value: `${profile.accountLevel}`,
          inline: true,
        },
        {
          name: "최근 5경기 승률",
          value: recentMatches.length
            ? `${Math.round((wins / recentMatches.length) * 100)}%`
            : "정보 없음",
          inline: true,
        },
        {
          name: "최근 5경기 평균 KDA",
          value: recentMatches.length ? average(kdaValues).toFixed(2) : "정보 없음",
          inline: true,
        },
        {
          name: "최근 5경기 평균 헤드샷률",
          value: recentMatches.length ? `${average(hsValues).toFixed(1)}%` : "정보 없음",
          inline: true,
        },
        {
          name: "최근 주 요원",
          value: topAgent,
          inline: true,
        }
      )
      .setFooter({ text: "Valorant Dashboard" })
      .setTimestamp();

    if (recentMatches.length) {
      embed.addFields({
        name: "최근 경기",
        value: recentMatches
          .slice(0, 5)
          .map(
            (match) =>
              `${resultEmoji(match.result)} **${match.agent}** · ${match.map} · ${match.kills}/${match.deaths}/${match.assists}`
          )
          .join("\n"),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      await interaction.editReply("해당 플레이어를 찾지 못했습니다. 게임명과 태그를 다시 확인해 주세요.");
      return;
    }

    console.error(`전적 명령 오류 [${interaction.user.id}]:`, error);
    await interaction.editReply("전적을 불러오는 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
}
