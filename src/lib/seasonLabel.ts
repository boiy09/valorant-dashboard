const ROMAN_ACTS: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
};

export function parseValorantSeason(season: string) {
  const match = season.match(/e(\d+)a(\d+)/i);
  if (!match) return null;

  return {
    episode: Number(match[1]),
    act: Number(match[2]),
  };
}

export function compareValorantSeasonDesc(a: string, b: string) {
  const left = parseValorantSeason(a);
  const right = parseValorantSeason(b);

  if (left && right) {
    if (left.episode !== right.episode) return right.episode - left.episode;
    return right.act - left.act;
  }

  return b.localeCompare(a);
}

export function formatValorantSeasonLabel(season: string) {
  const parsed = parseValorantSeason(season);
  if (!parsed) return season || "시즌 정보 없음";

  const { episode, act } = parsed;

  if (episode >= 10) {
    const version = 25 + Math.floor((episode - 10) / 2);
    const globalAct = ((episode - 10) % 2) * 3 + act;
    return `V${version} // 액트 ${ROMAN_ACTS[globalAct] ?? globalAct}`;
  }

  return `에피소드 ${episode} // 액트 ${ROMAN_ACTS[act] ?? act}`;
}
