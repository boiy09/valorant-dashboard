import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

const MAPS = [
  "어센트",
  "바인드",
  "헤이븐",
  "스플릿",
  "아이스박스",
  "브리즈",
  "프랙처",
  "펄",
  "로터스",
  "선셋",
  "어비스",
  "코로드",
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
  .setName("랜덤맵")
  .setDescription("발로란트 맵을 랜덤으로 뽑습니다.")
  .addIntegerOption((option) =>
    option
      .setName("개수")
      .setDescription("한 번에 뽑을 맵 개수")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(MAPS.length)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const count = interaction.options.getInteger("개수") ?? 1;
  const maps = count === 1 ? [pickRandom(MAPS)] : pickMany(MAPS, count);

  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle("랜덤 맵")
    .setDescription(maps.map((map, index) => `${index + 1}. **${map}**`).join("\n"));

  await interaction.reply({ embeds: [embed] });
}
