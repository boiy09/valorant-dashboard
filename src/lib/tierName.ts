const TIER_ID_TO_KO: Record<number, string> = {
  0: "언랭크",
  1: "언랭크",
  2: "언랭크",
  3: "아이언 1",
  4: "아이언 2",
  5: "아이언 3",
  6: "브론즈 1",
  7: "브론즈 2",
  8: "브론즈 3",
  9: "실버 1",
  10: "실버 2",
  11: "실버 3",
  12: "골드 1",
  13: "골드 2",
  14: "골드 3",
  15: "플래티넘 1",
  16: "플래티넘 2",
  17: "플래티넘 3",
  18: "다이아몬드 1",
  19: "다이아몬드 2",
  20: "다이아몬드 3",
  21: "초월자 1",
  22: "초월자 2",
  23: "초월자 3",
  24: "불멸 1",
  25: "불멸 2",
  26: "불멸 3",
  27: "레디언트",
};

const EN_TIER_TO_KO: Record<string, string> = {
  unranked: "언랭크",
  unrated: "언랭크",
  iron: "아이언",
  bronze: "브론즈",
  silver: "실버",
  gold: "골드",
  platinum: "플래티넘",
  diamond: "다이아몬드",
  ascendant: "초월자",
  immortal: "불멸",
  radiant: "레디언트",
};

const KO_TIER_ALIASES: Array<[RegExp, string]> = [
  [/언랭크|미배치|배치\s*전/i, "언랭크"],
  [/아이언\s*([123])/i, "아이언 $1"],
  [/브론즈\s*([123])/i, "브론즈 $1"],
  [/실버\s*([123])/i, "실버 $1"],
  [/골드\s*([123])/i, "골드 $1"],
  [/플래티넘\s*([123])/i, "플래티넘 $1"],
  [/다이아(?:몬드)?\s*([123])/i, "다이아몬드 $1"],
  [/초월(?:자)?\s*([123])/i, "초월자 $1"],
  [/불멸\s*([123])/i, "불멸 $1"],
  [/레디언트/i, "레디언트"],
];

export function tierIdToKorean(tierId: number, fallback = "언랭크") {
  return TIER_ID_TO_KO[tierId] ?? fallback;
}

export function normalizeTierName(name: string | null | undefined, tierId?: number | null) {
  if (typeof tierId === "number" && tierId > 0) return tierIdToKorean(tierId);

  const raw = (name ?? "").trim();
  if (!raw) return "언랭크";

  const lower = raw.toLowerCase();
  if (lower === "rank information") return "랭크 정보";
  if (lower === "no record") return "기록 없음";

  for (const [pattern, replacement] of KO_TIER_ALIASES) {
    if (pattern.test(raw)) return raw.replace(pattern, replacement);
  }

  for (const [english, korean] of Object.entries(EN_TIER_TO_KO)) {
    const match = lower.match(new RegExp(`\\b${english}\\b\\s*([123])?`, "i"));
    if (!match) continue;

    const division = match[1];
    return division && korean !== "언랭크" && korean !== "레디언트" ? `${korean} ${division}` : korean;
  }

  return raw;
}
