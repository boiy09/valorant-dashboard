import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getRecentMatches, getRiotOfficialRecentMatches, type MatchStats } from "@/lib/valorant";
import { getPrivateRecentMatches } from "@/lib/riotPrivateApi";
import { ensureValidTokens } from "@/lib/rankFetcher";

/**
 * POST /api/scrim/[id]/sync-match
 * 내전 참가자들의 최근 커스텀 매치를 조회하여
 * 참가자 전원이 포함된 매치를 찾아 승패/맵/KDA를 자동으로 기록한다.
 */
export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const { id } = await context.params;

  // 내전 세션 조회 (참가자 + 라이엇 계정 포함)
  const scrim = await prisma.scrimSession.findFirst({
    where: { id, guildId: guild.id },
    include: {
      players: {
        include: {
          user: {
            select: {
              id: true,
              riotAccounts: {
                select: { puuid: true, region: true, accessToken: true, entitlementsToken: true, ssid: true, authCookie: true, tokenExpiresAt: true },
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

  // 팀에 배정된 참가자 우선, 없으면 participant 전원으로 폴백
  const assignedPlayers = scrim.players.filter(
    (p) => p.team.startsWith("team_") && (p.role === "captain" || p.role === "member")
  );
  const targetPlayers = assignedPlayers.length >= 2 ? assignedPlayers : scrim.players;
  const usingParticipants = assignedPlayers.length < 2;

  if (targetPlayers.length < 2) {
    return Response.json({ error: "참가자가 2명 이상이어야 합니다." }, { status: 400 });
  }

  // 참가자별 PUUID 수집 (팀 정보 포함)
  type PlayerPuuidEntry = {
    playerId: string;
    userId: string;
    team: string;
    puuid: string;
    region: string;
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

  // 여러 대표 계정으로 최근 커스텀 매치 조회 (스코어보드 포함)
  const qRegion = playerPuuids[0].region === "AP" ? "ap" : "kr";

  // API 폴백 체인: Private Riot API (ssid 자동갱신) → Riot Official API → Henrik API
  // Henrik 429는 API 키 단위 제한이므로 감지 시 즉시 중단
  let recentMatches: MatchStats[] = [];
  let lastFetchError = "";
  let rateLimited = false;

  outer: for (const candidate of playerPuuids.slice(0, 3)) {
    // 1) Private Riot API — ssid로 만료 토큰 자동 갱신 후 시도
    try {
      const tokens = await ensureValidTokens(
        candidate.puuid,
        candidate.accessToken ?? null,
        candidate.entitlementsToken ?? null,
        candidate.ssid ?? null,
        candidate.authCookie ?? null,
        candidate.tokenExpiresAt ?? null,
      );
      if (tokens) {
        const privateMatches = await getPrivateRecentMatches(
          candidate.puuid,
          candidate.region,
          tokens.accessToken,
          tokens.entitlementsToken,
          { count: 20 }
        );
        if (privateMatches.length > 0) {
          recentMatches = privateMatches;
          break outer;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[sync-match] Private API 실패:", candidate.puuid, msg);
      lastFetchError = msg;
    }

    // 2) Riot Official API (RIOT_API_KEY 환경변수 있을 때)
    try {
      const officialMatches = await getRiotOfficialRecentMatches(candidate.puuid, qRegion, 10);
      if (officialMatches.length > 0) {
        recentMatches = officialMatches;
        break outer;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[sync-match] Official API 실패:", candidate.puuid, msg);
      lastFetchError = msg;
    }

    // 3) Henrik API (폴백) — 429 시 즉시 중단 (API 키 단위 제한)
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
      console.warn("[sync-match] Henrik API 실패:", candidate.puuid, msg);
      lastFetchError = msg;
      if (msg.includes("429")) {
        rateLimited = true;
        break outer;
      }
    }
  }

  if (recentMatches.length === 0) {
    const errorMsg = rateLimited
      ? "Henrik API 요청 한도 초과입니다. 잠시 후 다시 시도하거나 라이엇 계정을 재연동해 주세요."
      : `전적 데이터를 가져오는 데 실패했습니다.${lastFetchError ? ` (${lastFetchError})` : " 라이엇 계정이 연동된 참가자를 확인해 주세요."}`;
    return Response.json({ error: errorMsg }, { status: rateLimited ? 429 : 500 });
  }

  // 커스텀 매치만 필터링
  const customMatches = recentMatches.filter((m) => {
    const mode = m.mode?.toLowerCase() ?? "";
    return mode.includes("custom") || mode === "커스텀" || mode === "custom game";
  });

  if (customMatches.length === 0) {
    return Response.json({ error: "최근 경기 중 커스텀 매치를 찾을 수 없습니다." }, { status: 404 });
  }

  // 내전 참가자 PUUID 전체 Set
  const allParticipantPuuids = new Set(playerPuuids.map((p) => p.puuid));
  const minRequired = Math.max(4, Math.ceil(allParticipantPuuids.size * 0.25));

  // 가장 많이 겹치는 커스텀 매치 탐색 (참가자 25% 이상 포함이면 채택)
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

  // 팀별 라운드 승리 수 계산 → 승팀 결정
  const teams = matchedMatch.scoreboard?.teams ?? [];
  let winnerTeamColor: string | null = null;
  if (teams.length >= 2) {
    const winnerTeam = teams.find((t) => t.won);
    winnerTeamColor = winnerTeam?.teamId?.toLowerCase() ?? null; // "red" | "blue"
  }

  const scoreboardPlayers = matchedMatch.scoreboard?.players ?? [];

  // participant 모드: Valorant 팀 컬러 기반으로 자동 team_a/team_b 배정
  if (usingParticipants) {
    for (const entry of playerPuuids) {
      const sbPlayer = scoreboardPlayers.find((p) => p.puuid === entry.puuid);
      const color = sbPlayer?.teamId?.toLowerCase();
      entry.team = color === "blue" ? "team_a" : color === "red" ? "team_b" : "team_a";
    }
  }

  // 발로란트 팀 컬러(red/blue)를 내전 팀 ID에 매핑
  const teamAPlayers = playerPuuids.filter((p) => p.team === "team_a");
  const teamBPlayers = playerPuuids.filter((p) => p.team === "team_b");

  let winnerId: string | null = null;
  if (winnerTeamColor && teamAPlayers.length > 0 && teamBPlayers.length > 0) {
    const teamAFirstPuuid = teamAPlayers[0].puuid;
    const teamAScoreboardPlayer = scoreboardPlayers.find((p) => p.puuid === teamAFirstPuuid);
    const teamAColor = teamAScoreboardPlayer?.teamId?.toLowerCase();

    if (teamAColor === winnerTeamColor) {
      winnerId = "team_a";
    } else if (teamAColor) {
      winnerId = "team_b";
    }
    if (!teamAColor) winnerId = "draw";
  } else if (winnerTeamColor === null && teams.length >= 2) {
    winnerId = "draw";
  }

  // 맵 이름 한국어 매핑
  const MAP_KO: Record<string, string> = {
    "Ascent": "어센트",
    "Bind": "바인드",
    "Haven": "헤이븐",
    "Split": "스플릿",
    "Icebox": "아이스박스",
    "Fracture": "프랙처",
    "Pearl": "펄",
    "Lotus": "로터스",
    "Sunset": "선셋",
    "Abyss": "어비스",
  };
  const rawMapName = matchedMatch.map ?? "";
  const mapName = MAP_KO[rawMapName] ?? rawMapName;

  // 팀별 라운드 수 (ACS 계산용)
  const teamRoundsMap = new Map<string, number>();
  for (const t of matchedMatch.scoreboard?.teams ?? []) {
    if (t.teamId) teamRoundsMap.set(t.teamId.toLowerCase(), t.roundsWon ?? 0);
  }

  // KDA + score 추출
  const kdaUpdates: { id: string; kills: number; deaths: number; assists: number }[] = [];
  const kdaSnapshot: {
    userId: string; kills: number; deaths: number; assists: number;
    acs: number; team: string;
  }[] = [];

  for (const entry of playerPuuids) {
    const sbPlayer = scoreboardPlayers.find((p) => p.puuid === entry.puuid);
    if (!sbPlayer) continue;
    const teamColor = sbPlayer.teamId?.toLowerCase() ?? "";

    kdaUpdates.push({
      id: entry.playerId,
      kills: sbPlayer.kills ?? 0,
      deaths: sbPlayer.deaths ?? 0,
      assists: sbPlayer.assists ?? 0,
    });
    kdaSnapshot.push({
      userId: entry.userId,
      kills: sbPlayer.kills ?? 0,
      deaths: sbPlayer.deaths ?? 0,
      assists: sbPlayer.assists ?? 0,
      acs: sbPlayer.acs ?? 0,
      team: teamColor,
    });
  }

  // DB 저장
  await prisma.$transaction(async (tx) => {
    const sessionData: Record<string, unknown> = {
      status: "done",
      endedAt: new Date(),
    };
    if (winnerId !== undefined) sessionData.winnerId = winnerId;
    if (mapName) sessionData.map = mapName;

    await tx.scrimSession.update({
      where: { id: scrim.id },
      data: sessionData,
    });

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
  });

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
        JSON.stringify(kdaSnapshot),
        winnerId ?? null,
        matchedMatch.matchId ?? null,
        mapName || null,
        existingGames[0].id
      );
    } else {
      const gameId = `scrimgame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ScrimGame" ("id","sessionId","gameNumber","map","teamSnapshot","kdaSnapshot","winnerId","matchId","createdAt")
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,NOW())`,
        gameId, scrim.id,
        mapName || null,
        JSON.stringify(teamSnapshot),
        JSON.stringify(kdaSnapshot),
        winnerId ?? null,
        matchedMatch.matchId ?? null
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
