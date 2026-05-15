// op.gg Valorant 내부 API 스크래핑

const OPGG_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "Origin": "https://op.gg",
  "Referer": "https://op.gg/ko/valorant",
  "Cache-Control": "no-cache",
};

export interface OpGgMatch {
  id: string;
  queueId: string; // "custom", "competitive", etc.
  gameStartedAt: string;
  gameDuration: number;
  mapName: string;
  isWin: boolean;
  myData: {
    puuid: string;
    gameName: string;
    tagLine: string;
    agentName: string;
    kills: number;
    deaths: number;
    assists: number;
    acs: number;
    teamId: string;
  };
  participants: Array<{
    puuid: string;
    gameName: string;
    tagLine: string;
    agentName: string;
    kills: number;
    deaths: number;
    assists: number;
    acs: number;
    teamId: string;
    isWin: boolean;
  }>;
  teams: Array<{
    teamId: string;
    isWin: boolean;
    roundsWon: number;
  }>;
}

async function opGgFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: OPGG_HEADERS as Record<string, string>,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn("[opgg] 요청 실패:", res.status, url);
      return null;
    }
    return await res.json() as T;
  } catch (e) {
    console.warn("[opgg] 요청 오류:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// op.gg Valorant 매치 목록 조회 (gameName-tagLine 형식, 예: "백마사냥꾼-100")
export async function getOpGgCustomMatches(
  gameName: string,
  tagLine: string,
  limit = 20
): Promise<OpGgMatch[]> {
  // op.gg 내부 API: 프로필 페이지 데이터 소스
  const slug = `${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  const baseUrl = `https://op.gg/api/v1.0/internal/bypass/games/global/valorant/summoners/${slug}/games`;
  const url = `${baseUrl}?&game_type=CUSTOM&limit=${limit}&hl=ko_KR`;

  const data = await opGgFetch<{
    data?: Array<{
      id?: string;
      meta?: {
        queue_info?: { game_type?: string };
        started_at?: string;
        game_length_second?: number;
        map_info?: { name?: string };
      };
      myData?: {
        summoner?: { summoner_id?: string; game_name?: string; tag_line?: string };
        stats?: { kills?: number; deaths?: number; assists?: number; combat_score?: number };
        champion?: { name?: string };
        is_win?: boolean;
        team_key?: string;
      };
      participants?: Array<{
        summoner?: { summoner_id?: string; game_name?: string; tag_line?: string };
        stats?: { kills?: number; deaths?: number; assists?: number; combat_score?: number };
        champion?: { name?: string };
        is_win?: boolean;
        team_key?: string;
      }>;
      teams?: Array<{ key?: string; game_result?: string; round_count?: number }>;
    }>;
  }>(url);

  if (!data?.data) return [];

  return data.data.map((g): OpGgMatch => {
    const myD = g.myData;
    const myStats = myD?.stats ?? {};
    const totalRounds = (g.teams ?? []).reduce((s, t) => s + (t.round_count ?? 0), 0);
    const halfRounds = totalRounds / 2;
    return {
      id: g.id ?? "",
      queueId: g.meta?.queue_info?.game_type?.toLowerCase() ?? "custom",
      gameStartedAt: g.meta?.started_at ?? "",
      gameDuration: g.meta?.game_length_second ?? 0,
      mapName: g.meta?.map_info?.name ?? "",
      isWin: myD?.is_win ?? false,
      myData: {
        puuid: myD?.summoner?.summoner_id ?? "",
        gameName: myD?.summoner?.game_name ?? "",
        tagLine: myD?.summoner?.tag_line ?? "",
        agentName: myD?.champion?.name ?? "",
        kills: myStats.kills ?? 0,
        deaths: myStats.deaths ?? 0,
        assists: myStats.assists ?? 0,
        acs: halfRounds > 0 ? Math.round((myStats.combat_score ?? 0) / halfRounds) : 0,
        teamId: myD?.team_key ?? "",
      },
      participants: (g.participants ?? []).map((p) => {
        const ps = p.stats ?? {};
        return {
          puuid: p.summoner?.summoner_id ?? "",
          gameName: p.summoner?.game_name ?? "",
          tagLine: p.summoner?.tag_line ?? "",
          agentName: p.champion?.name ?? "",
          kills: ps.kills ?? 0,
          deaths: ps.deaths ?? 0,
          assists: ps.assists ?? 0,
          acs: halfRounds > 0 ? Math.round((ps.combat_score ?? 0) / halfRounds) : 0,
          teamId: p.team_key ?? "",
          isWin: p.is_win ?? false,
        };
      }),
      teams: (g.teams ?? []).map((t) => ({
        teamId: t.key ?? "",
        isWin: t.game_result === "WIN",
        roundsWon: t.round_count ?? 0,
      })),
    };
  });
}

// op.gg에서 일반 최근 매치 목록 조회 (custom 포함 전체)
export async function getOpGgRecentMatches(
  gameName: string,
  tagLine: string,
  limit = 10
): Promise<OpGgMatch[]> {
  const slug = `${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  const url = `https://op.gg/api/v1.0/internal/bypass/games/global/valorant/summoners/${slug}/games?limit=${limit}&hl=ko_KR`;

  const data = await opGgFetch<{
    data?: Array<{
      id?: string;
      meta?: {
        queue_info?: { game_type?: string };
        started_at?: string;
        game_length_second?: number;
        map_info?: { name?: string };
      };
      myData?: {
        summoner?: { summoner_id?: string; game_name?: string; tag_line?: string };
        stats?: { kills?: number; deaths?: number; assists?: number; combat_score?: number };
        champion?: { name?: string };
        is_win?: boolean;
        team_key?: string;
      };
      participants?: Array<{
        summoner?: { summoner_id?: string; game_name?: string; tag_line?: string };
        stats?: { kills?: number; deaths?: number; assists?: number; combat_score?: number };
        champion?: { name?: string };
        is_win?: boolean;
        team_key?: string;
      }>;
      teams?: Array<{ key?: string; game_result?: string; round_count?: number }>;
    }>;
  }>(url);

  if (!data?.data) return [];

  return data.data.map((g): OpGgMatch => {
    const myD = g.myData;
    const myStats = myD?.stats ?? {};
    const totalRounds = (g.teams ?? []).reduce((s, t) => s + (t.round_count ?? 0), 0);
    const halfRounds = totalRounds / 2;
    return {
      id: g.id ?? "",
      queueId: g.meta?.queue_info?.game_type?.toLowerCase() ?? "normal",
      gameStartedAt: g.meta?.started_at ?? "",
      gameDuration: g.meta?.game_length_second ?? 0,
      mapName: g.meta?.map_info?.name ?? "",
      isWin: myD?.is_win ?? false,
      myData: {
        puuid: myD?.summoner?.summoner_id ?? "",
        gameName: myD?.summoner?.game_name ?? "",
        tagLine: myD?.summoner?.tag_line ?? "",
        agentName: myD?.champion?.name ?? "",
        kills: myStats.kills ?? 0,
        deaths: myStats.deaths ?? 0,
        assists: myStats.assists ?? 0,
        acs: halfRounds > 0 ? Math.round((myStats.combat_score ?? 0) / halfRounds) : 0,
        teamId: myD?.team_key ?? "",
      },
      participants: (g.participants ?? []).map((p) => {
        const ps = p.stats ?? {};
        return {
          puuid: p.summoner?.summoner_id ?? "",
          gameName: p.summoner?.game_name ?? "",
          tagLine: p.summoner?.tag_line ?? "",
          agentName: p.champion?.name ?? "",
          kills: ps.kills ?? 0,
          deaths: ps.deaths ?? 0,
          assists: ps.assists ?? 0,
          acs: halfRounds > 0 ? Math.round((ps.combat_score ?? 0) / halfRounds) : 0,
          teamId: p.team_key ?? "",
          isWin: p.is_win ?? false,
        };
      }),
      teams: (g.teams ?? []).map((t) => ({
        teamId: t.key ?? "",
        isWin: t.game_result === "WIN",
        roundsWon: t.round_count ?? 0,
      })),
    };
  });
}

// op.gg에서 최근 커스텀 게임 매치 ID 목록만 추출
export async function getOpGgCustomMatchIds(
  gameName: string,
  tagLine: string
): Promise<string[]> {
  const matches = await getOpGgCustomMatches(gameName, tagLine, 10);
  return matches.map((m) => m.id).filter(Boolean);
}
