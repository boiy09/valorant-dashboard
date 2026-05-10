import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

const AGENTS = [
  { name: "제트", role: "타격대" },
  { name: "레이즈", role: "타격대" },
  { name: "피닉스", role: "타격대" },
  { name: "레이나", role: "타격대" },
  { name: "요루", role: "타격대" },
  { name: "네온", role: "타격대" },
  { name: "아이소", role: "타격대" },
  { name: "브리치", role: "척후대" },
  { name: "소바", role: "척후대" },
  { name: "스카이", role: "척후대" },
  { name: "케이/오", role: "척후대" },
  { name: "페이드", role: "척후대" },
  { name: "게코", role: "척후대" },
  { name: "테호", role: "척후대" },
  { name: "브림스톤", role: "전략가" },
  { name: "오멘", role: "전략가" },
  { name: "바이퍼", role: "전략가" },
  { name: "아스트라", role: "전략가" },
  { name: "하버", role: "전략가" },
  { name: "클로브", role: "전략가" },
  { name: "사이퍼", role: "감시자" },
  { name: "킬조이", role: "감시자" },
  { name: "세이지", role: "감시자" },
  { name: "체임버", role: "감시자" },
  { name: "데드록", role: "감시자" },
  { name: "바이스", role: "감시자" },
];

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickMany<T>(items: T[], count: number) {
  const pool = [...items];
  const result: T[] = [];

  while (pool.length > 0 && result.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(index, 1);
    result.push(item);
  }

  return result;
}

export const data = new SlashCommandBuilder()
  .setName("랜덤요원")
  .setDescription("발로란트 요원을 랜덤으로 뽑습니다.")
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("한 번에 뽑을 요원 개수")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10)
  )
  .addStringOption((option) =>
    option
      .setName("역할군")
      .setDescription("특정 역할군 안에서만 뽑습니다.")
      .setRequired(false)
      .addChoices(
        { name: "타격대", value: "타격대" },
        { name: "척후대", value: "척후대" },
        { name: "전략가", value: "전략가" },
        { name: "감시자", value: "감시자" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getString("역할군");
  const pool = role ? AGENTS.filter((agent) => agent.role === role) : AGENTS;
  const count = Math.min(interaction.options.getInteger("개수") ?? 1, pool.length);
  const agents = count === 1 ? [pickRandom(pool)] : pickMany(pool, count);

  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle("랜덤 요원")
    .setDescription(agents.map((agent, index) => `${index + 1}. **${agent.name}** (${agent.role})`).join("\n"));

  await interaction.reply({ embeds: [embed] });
}
