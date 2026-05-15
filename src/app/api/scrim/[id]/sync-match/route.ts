import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getRecentMatches, getRiotOfficialRecentMatches, getTrackerCustomMatchIds, getHenrikMatchById, type MatchStats, type ScoreboardPlayer, type ScoreboardTeam } from "@/lib/valorant";
import { getPrivateRecentMatches } from "@/lib/riotPrivateApi";
import { ensureValidTokens } from "@/lib/rankFetcher";
import { getOpGgCustomMatches, getOpGgRecentMatches, type OpGgMatch } from "@/lib/opgg-valorant";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await handleSyncMatch(context);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-match] 예상치 못한 오류:", msg);
    return Response.json({ error: `서버 오류: ${msg}` }, { status: 500 });
  }
}

async function handleSyncMatch(context: { params: Promise<{ id: string }> }) {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;

  const scrim = await prisma.scrimSession.findFirst({
    where: { id, guildId: guild.id },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              riotAccounts: {
                select: { puuid: true, region: true, gameName: true, tagLine: true, accessToken: true, entitlementsToken: true, ssid: true, authCookie: true, tokenExpiresAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const currentManagers = (() => {
    try {
      const p = JSON.parse(scrim.managers || "[]");
      return Array.isArray(p) ? p : [scrim.createdBy];
    } catch { return [scrim.createdBy]; }
  })();
  if (!isAdmin && !currentManagers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const assignedPlayers = scrim.players.filter(
    (p) => p.team.startsWith("team_") && (p.role === "captain" || p.role === "member")
  );
  const targetPlayers = assignedPlayers.length >= 2 ? assignedPlayers : scrim.players;
  const usingParticipants = assignedPlayers.length < 2;

  if (targetPlayers.length < 2) {
    return Response.json({ error: "참가자가 2명 이상이어야 합니다." }, { status: 400 });
  }

  type PlayerPuuidEntry = {
    playerId: string;
    userId: string;
    team: string;
    puuid: string;
    region: string;
    gameName: string;
    tagLine: string;
    accessToken?: string | null;
    entitlementsToken?: string | null;
    ssid?: string | null;
    authCookie?: string | null;
    tokenExpiresAt?: Date | null;
  };
  const playerPuuids: PlayerPuuidEntry[] = [];
  for (const p of targetPlayers) {
    for (const acc of p.user.riotAccounts) {
      if (acc.puuid && !acc.puuid.startsWith("dummy-puuid-")) {
        playerPuuids.push({
          playerId: p.id,
          userId: p.user.id,
          team: p.team,
          puuid: acc.puuid,
          region: acc.region ?? "KR",
          gameName: acc.gameName,
          tagLine: acc.tagLine,
          accessToken: acc.accessToken,
          entitlementsToken: acc.entitlementsToken,
          ssid: acc.ssid,
          authCookie: acc.authCookie,
          tokenExpiresAt: acc.tokenExpiresAt,
        });
      }
    }
  }

  if (playerPuuids.length === 0) {
    return Response.json({ error: "라이엇 계정이 연동된 참가자가 없습니다." }, { status: 400 });
  }

  const sessionUserId = session.user!.id;
  const sessionUserAccounts = await prisma.riotAccount.findMany({
    where: { user: { id: sessionUserId } },
    select: { puuid: true, region: true, gameName: true, tagLine: true, accessToken: true, entitlementsToken: true, ssid: true, authCookie: true, tokenExpiresAt: true },
  });
  const extraCandidates = sessionUserAccounts
    .filter((acc) => acc.puuid && !playerPuuids.some((p) => p.puuid === acc.puuid))
    .map((acc) => ({
      playerId: "",
      userId: sessionUserId,
      team: "",
      puuid: acc.puuid,
      region: acc.region ?? "KR",
      gameName: acc.gameName,
      tagLine: acc.tagLine,
      accessToken: acc.accessToken,
      entitlementsToken: acc.entitlementsToken,
      ssid: acc.ssid,
      authCookie: acc.authCookie,
      tokenExpiresAt: acc.tokenExpiresAt,
    }));

  const sessionInPlayers = playerPuuids.find((p) => p.userId === sessionUserId);
  const orderedCandidates = sessionInPlayers
    ? [sessionInPlayers, ...playerPuuids.filter((p) => p.userId !== sessionUserId), ...extraCandidates]
    : [...extraCandidates, ...playerPuuids];

  const qRegion = (playerPuuids[0]?.region ?? "KR") === "AP" ? "ap" : "kr";

  // Phase 1: 유효한 토큰 확보 (관리자 우선). tokenHolderPuuid를 추적한다.
  // Riot Private API는 토큰 소유자 본인의 PUUID만 조회 가능하므로 반드시 매핑해야 한다.
  let sharedTokens: { accessToken: string; entitlementsToken: string } | null = null;
  let tokenHolderPuuid: string | null = null;
  let tokenDebug = "";
  for (const candidate of orderedCandidates.slice(0, 5)) {
    try {
      const hasSsid = !!candidate.ssid;
      const hasAuthCookie = !!candidate.authCookie;
      const hasAccessToken = !!candidate.accessToken;
      tokenDebug += `[${candidate.puuid.slice(0, 8)} ssid=${hasSsid} cookie=${hasAuthCookie} at=${hasAccessToken}] `;
      const t = await ensureValidTokens(
        candidate.puuid,
        candidate.accessToken ?? null,
        candidate.entitlementsToken ?? null,
        candidate.ssid ?? null,
        candidate.authCookie ?? null,
        candidate.tokenExpiresAt ?? null,
      );
      if (t) { sharedTokens = t; tokenHolderPuuid = candidate.puuid; tokenDebug += "→ OK "; break; }
      else tokenDebug += "→ null ";
    } catch (e) {
      tokenDebug += `→ throw(${e instanceof Error ? e.message : String(e)}) `;
    }
  }

  let recentMatches: MatchStats[] = [];
  let lastFetchError = "";
  let rateLimited = false;

  // Phase 2: 관리자 우선 순서로 참가자 매치 기록 조회
  // Private API는 각 PUUID 소유자의 토큰만 사용 (남의 토큰으로 다른 PUUID 조회 불가)
  const participantPuuidSet = new Set(playerPuuids.map((p) => p.puuid));
  const orderedParticipants = [
    ...orderedCandidates.filter((c) => participantPuuidSet.has(c.puuid)),
    ...playerPuuids.filter((p) => !orderedCandidates.some((c) => c.puuid === p.puuid)),
  ];

  outer: for (const candidate of orderedParticipants.slice(0, 3)) {
    // 1) Riot Official API — 먼저 시도 (20경기, 가장 안정적)
    try {
      const officialMatches = await getRiotOfficialRecentMatches(candidate.puuid, qRegion, 20);
      if (officialMatches.length > 0) {
        recentMatches = officialMatches;
        break outer;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[sync-match] Official API 실패:", candidate.puuid.slice(0, 8), msg);
      lastFetchError = msg;
    }

    // 2) Private Riot API — 이 PUUID의 소유자 토큰만 사용
    const privateTokens = resolvePrivateTokens(candidate, sharedTokens, tokenHolderPuuid);
    if (privateTokens) {
      try {
        const privateMatches = await getPrivateRecentMatches(
          candidate.puuid,
          candidate.region,
          privateTokens.accessToken,
          privateTokens.entitlementsToken,
          { count: 20 }
        );
        if (privateMatches.length > 0) {
          recentMatches = privateMatches;
          break outer;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[sync-match] Private API 실패:", candidate.puuid.slice(0, 8), msg);
        lastFetchError = msg;
      }
    }

    // 3) Henrik API 폴백 — 429 즉시 중단
    try {
      const henrikMatches = await getRecentMatches(candidate.puuid, 25, qRegion, "pc", {
        skipAccountFallback: true,
        skipRankFallback: true,
      });
      if (henrikMatches.length > 0) {
        recentMatches = henrikMatches;
        break outer;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[sync-match] Henrik API 실패:", candidate.puuid.slice(0, 8), msg);
      lastFetchError = msg;
      if (msg.includes("429")) {
        rateLimited = true;
        break outer;
      }
    }
  }

  // tracker.gg → Henrik match-by-ID 폴백 (Henrik 히스토리 한도 초과 시)
  if (recentMatches.length === 0) {
    trackerFallback: for (const candidate of orderedParticipants.slice(0, 5)) {
      if (!candidate.gameName || !candidate.tagLine) continue;
      try {
        const matchIds = await getTrackerCustomMatchIds(candidate.gameName, candidate.tagLine);
        if (matchIds.length === 0) continue;
        const region = (candidate.region === "AP" ? "ap" : "kr") as "ap" | "kr";
        for (const mId of matchIds.slice(0, 10)) {
          const m = await getHenrikMatchById(mId, region);
          if (m) { recentMatches = [m]; break trackerFallback; }
        }
      } catch { continue; }
    }
  }

  // op.gg 커스텀 폴백 — Henrik 전역 차단 시에도 작동
  if (recentMatches.length === 0) {
    for (const candidate of orderedParticipants.slice(0, 5)) {
      if (!candidate.gameName || !candidate.tagLine) continue;
      try {
        const opggMatches = await getOpGgCustomMatches(candidate.gameName, candidate.tagLine, 20);
        if (opggMatches.length > 0) {
          recentMatches = opggMatches.map(opggMatchToMatchStats);
          console.log("[sync-match] op.gg 커스텀 폴백 성공:", candidate.gameName, opggMatches.length, "경기");
          break;
        }
      } catch (e) {
        console.warn("[sync-match] op.gg 커스텀 폴백 실패:", candidate.gameName, e instanceof Error ? e.message : String(e));
      }
    }
  }

  // op.gg 일반 매치 폴백 — 커스텀 필터 없이 전체 조회 후 custom 필터링
  if (recentMatches.length === 0) {
    for (const candidate of orderedParticipants.slice(0, 5)) {
      if (!candidate.gameName || !candidate.tagLine) continue;
      try {
        const opggMatches = await getOpGgRecentMatches(candidate.gameName, candidate.tagLine, 30);
        const customOnly = opggMatches.filter((m) => {
          const q = (m.queueId ?? "").toLowerCase();
          return q.includes("custom") || q === "커스텀";
        });
        if (customOnly.length > 0) {
          recentMatches = customOnly.map(opggMatchToMatchStats);
          console.log("[sync-match] op.gg 일반→커스텀 폴백 성공:", candidate.gameName, customOnly.length, "경기");
          break;
        }
      } catch (e) {
        console.warn("[sync-match] op.gg 일반 폴백 실패:", candidate.gameName, e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (recentMatches.length === 0) {
    const debugSuffix = tokenDebug ? ` [토큰 진단: ${tokenDebug.trim()}]` : "";
    const errorMsg = rateLimited
      ? `Henrik API 요청 한도 초과입니다. 잠시 후 다시 시도하거나 라이엇 계정을 재연동해 주세요.${debugSuffix}`
      : `전적 데이터를 가져오는 데 실패했습니다.${lastFetchError ? ` (${lastFetchError})` : " 라이엇 계정이 연동된 참가자를 확인해 주세요."}${debugSuffix}`;
    return Response.json({ error: errorMsg }, { status: rateLimited ? 429 : 500 });
  }

  const customMatches = recentMatches.filter((m) => {
    const mode = m.mode?.toLowerCase() ?? "";
    return mode.includes("custom") || mode === "커스텀" || mode === "custom game";
  });

  if (customMatches.length === 0) {
    return Response.json({ error: "최근 경기 중 커스텀 매치를 찾을 수 없습니다." }, { status: 404 });
  }

  const allParticipantPuuids = new Set(playerPuuids.map((p) => p.puuid));
  const minRequired = Math.max(4, Math.ceil(allParticipantPuuids.size * 0.25));

  let matchedMatch: MatchStats | null = null;
  let bestOverlap = 0;
  for (const match of customMatches) {
    const matchPuuids = (match.scoreboard?.players ?? [])
      .map((p) => p.puuid)
      .filter(Boolean);
    if (matchPuuids.length === 0) continue;
    const matchSet = new Set(matchPuuids);
    const overlap = [...allParticipantPuuids].filter((puuid) => matchSet.has(puuid)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      matchedMatch = match;
    }
  }

  if (!matchedMatch || bestOverlap < minRequired) {
    return Response.json({
      error: `참가자와 겹치는 커스텀 매치를 찾을 수 없습니다. (최대 겹침: ${bestOverlap}/${allParticipantPuuids.size}명, 필요: ${minRequired}명 이상) 전적이 아직 업데이트되지 않았을 수 있습니다.`,
    }, { status: 404 });
  }

  const teams = matchedMatch.scoreboard?.teams ?? [];
  let winnerTeamColor: string | null = null;
  if (teams.length >= 2) {
    const winnerTeam = teams.find((t) => t.won);
    winnerTeamColor = winnerTeam?.teamId?.toLowerCase() ?? null;
  }

  const scoreboardPlayers = matchedMatch.scoreboard?.players ?? [];

  if (usingParticipants) {
    for (const entry of playerPuuids) {
      const sbPlayer = scoreboardPlayers.find((p) => p.puuid === entry.puuid);
      const color = sbPlayer?.teamId?.toLowerCase();
      entry.team = color === "blue" ? "team_a" : color === "red" ? "team_b" : "team_a";
    }
  }

  const teamAPlayers = playerPuuids.filter((p) => p.team === "team_a");
  const teamBPlayers = playerPuuids.filter((p) => p.team === "team_b");

  let winnerId: string | null = null;
  if (winnerTeamColor && teamAPlayers.length > 0 && teamBPlayers.length > 0) {
    const teamAFirstPuuid = teamAPlayers[0].puuid;
    const teamAScoreboardPlayer = scoreboardPlayers.find((p) => p.puuid === teamAFirstPuuid);
    const teamAColor = teamAScoreboardPlayer?.teamId?.toLowerCase();
    if (teamAColor === winnerTeamColor) { winnerId = "team_a"; }
    else if (teamAColor) { winnerId = "team_b"; }
    if (!teamAColor) winnerId = "draw";
  } else if (winnerTeamColor === null && teams.length >= 2) {
    winnerId = "draw";
  }

  const MAP_KO: Record<string, string> = {
    "Ascent": "어센트", "Bind": "바인드", "Haven": "헤이븐", "Split": "스플릿",
    "Icebox": "아이스박스", "Fracture": "프랙처", "Pearl": "펄", "Lotus": "로터스",
    "Sunset": "선셋", "Abyss": "어비스",
  };
  const rawMapName = matchedMatch.map ?? "";
  const mapName = MAP_KO[rawMapName] ?? rawMapName;

  // 팀별 라운드 승수 맵
  const teamRoundsMap: Record<string, number> = {};
  for (const t of teams) {
    const tid = (t.teamId ?? "").toLowerCase();
    if (tid) teamRoundsMap[tid] = t.roundsWon ?? 0;
  }

  const kdaUpdates: { id: string; kills: number; deaths: number; assists: number }[] = [];
  const kdaSnapshot: {
    userId: string; kills: number; deaths: number; assists: number; acs: number;
    team: string; name: string; agent: string; agentIcon: string; cardIcon: string;
    tierName: string; currentTier: number; teamRoundsWon: number;
  }[] = [];

  for (const entry of playerPuuids) {
    const sbPlayer = scoreboardPlayers.find((p) => p.puuid === entry.puuid);
    if (!sbPlayer) continue;
    const teamColor = (sbPlayer.teamId ?? "").toLowerCase();
    kdaUpdates.push({ id: entry.playerId, kills: sbPlayer.kills ?? 0, deaths: sbPlayer.deaths ?? 0, assists: sbPlayer.assists ?? 0 });
    kdaSnapshot.push({
      userId: entry.userId,
      kills: sbPlayer.kills ?? 0,
      deaths: sbPlayer.deaths ?? 0,
      assists: sbPlayer.assists ?? 0,
      acs: sbPlayer.acs ?? 0,
      team: teamColor,
      name: sbPlayer.name ?? entry.gameName ?? "",
      agent: sbPlayer.agent ?? "",
      agentIcon: sbPlayer.agentIcon ?? "",
      cardIcon: sbPlayer.cardIcon ?? "",
      tierName: sbPlayer.tierName ?? "",
      currentTier: sbPlayer.tierId ?? 0,
      teamRoundsWon: teamRoundsMap[teamColor] ?? 0,
    });
  }

  await prisma.$transaction(async (tx) => {
    const sessionData: Record<string, unknown> = { status: "done", endedAt: new Date() };
    if (winnerId !== undefined) sessionData.winnerId = winnerId;
    if (mapName) sessionData.map = mapName;
    await tx.scrimSession.update({ where: { id: scrim.id }, data: sessionData });

    if (usingParticipants) {
      for (const entry of playerPuuids) {
        await tx.scrimPlayer.updateMany({
          where: { id: entry.playerId, sessionId: scrim.id },
          data: { team: entry.team, role: "member" },
        });
      }
    }
    for (const kda of kdaUpdates) {
      await tx.scrimPlayer.updateMany({
        where: { id: kda.id, sessionId: scrim.id },
        data: { kills: kda.kills, deaths: kda.deaths, assists: kda.assists },
      });
    }
  }, { timeout: 15000 });

  if (kdaSnapshot.length > 0) {
    const existingGames = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "ScrimGame" WHERE "sessionId" = $1 ORDER BY "gameNumber" DESC LIMIT 1`,
      scrim.id
    );
    const teamSnapshot: Record<string, string[]> = {};
    for (const entry of playerPuuids) {
      if (!teamSnapshot[entry.team]) teamSnapshot[entry.team] = [];
      teamSnapshot[entry.team].push(entry.userId);
    }
    if (existingGames.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ScrimGame" SET "kdaSnapshot" = $1, "winnerId" = $2, "matchId" = $3, "map" = $4 WHERE "id" = $5`,
        JSON.stringify(kdaSnapshot), winnerId ?? null, matchedMatch.matchId ?? null, mapName || null, existingGames[0].id
      );
    } else {
      const gameId = `scrimgame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ScrimGame" ("id","sessionId","gameNumber","map","teamSnapshot","kdaSnapshot","winnerId","matchId","createdAt") VALUES ($1,$2,1,$3,$4,$5,$6,$7,NOW())`,
        gameId, scrim.id, mapName || null, JSON.stringify(teamSnapshot), JSON.stringify(kdaSnapshot), winnerId ?? null, matchedMatch.matchId ?? null
      );
    }
  }

  return Response.json({
    success: true,
    matchId: matchedMatch.matchId,
    map: mapName,
    winnerId,
    kdaCount: kdaUpdates.length,
    message: `전적 자동 연동 완료: ${mapName} / ${winnerId === "team_a" ? "팀A 승리" : winnerId === "team_b" ? "팀B 승리" : winnerId === "draw" ? "무승부" : "승패 미정"} / KDA ${kdaUpdates.length}명 기록`,
  });
}

/**
 * Riot Private API는 토큰 소유자 본인의 PUUID만 조회 가능하다.
 * sharedTokens가 이 candidate 소유라면 그것을 사용하고,
 * 아니면 candidate 자신의 저장된 토큰이 아직 유효한지 확인한다.
 */
function resolvePrivateTokens(
  candidate: { puuid: string; accessToken?: string | null; entitlementsToken?: string | null; tokenExpiresAt?: Date | null },
  sharedTokens: { accessToken: string; entitlementsToken: string } | null,
  tokenHolderPuuid: string | null,
): { accessToken: string; entitlementsToken: string } | null {
  if (sharedTokens && tokenHolderPuuid === candidate.puuid) return sharedTokens;
  if (candidate.accessToken && candidate.entitlementsToken) {
    const exp = candidate.tokenExpiresAt;
    if (!exp || exp.getTime() > Date.now() + 30_000) {
      return { accessToken: candidate.accessToken, entitlementsToken: candidate.entitlementsToken };
    }
  }
  return null;
}

function opggMatchToMatchStats(m: OpGgMatch): MatchStats {
  const players: ScoreboardPlayer[] = m.participants.map((p) => ({
    puuid: p.puuid,
    name: p.gameName,
    tag: p.tagLine,
    isPrivate: false,
    teamId: p.teamId,
    level: null,
    cardIcon: "",
    agent: p.agentName,
    agentIcon: "",
    tierName: "",
    tierId: 0,
    tierIcon: null,
    acs: p.acs,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    plusMinus: p.kills - p.deaths,
    kd: p.deaths > 0 ? p.kills / p.deaths : p.kills,
    hsPercent: 0,
    adr: null,
  }));
  const teams: ScoreboardTeam[] = m.teams.map((t) => ({
    teamId: t.teamId,
    roundsWon: t.roundsWon,
    won: t.isWin,
  }));
  const totalRounds = m.teams.reduce((s, t) => s + t.roundsWon, 0);
  return {
    matchId: m.id,
    map: m.mapName,
    mode: m.queueId,
    agent: "",
    agentIcon: "",
    result: "무효",
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    teamScore: null,
    enemyScore: null,
    headshots: 0,
    bodyshots: 0,
    legshots: 0,
    adr: null,
    playedAt: m.gameStartedAt ? new Date(m.gameStartedAt) : new Date(0),
    scoreboard: {
      map: m.mapName,
      mode: m.queueId,
      startedAt: m.gameStartedAt,
      gameLengthMs: m.gameDuration * 1000,
      totalRounds,
      players,
      teams,
      rounds: [],
    },
  };
}
