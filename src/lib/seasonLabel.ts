const ROMAN_ACTS: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
};

export function formatValorantSeasonLabel(season: string) {
  const match = season.match(/e(\d+)a(\d+)/i);
  if (!match) return season || "시즌 정보 없음";

  const episode = Number(match[1]);
  const act = Number(match[2]);

  if (episode >= 10) {
    const version = 25 + Math.floor((episode - 10) / 2);
    const globalAct = ((episode - 10) % 2) * 3 + act;
    return `V${version} // 액트 ${ROMAN_ACTS[globalAct] ?? globalAct}`;
  }

  return `에피소드 ${episode} // 액트 ${ROMAN_ACTS[act] ?? act}`;
}
