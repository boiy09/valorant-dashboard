import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const VALORANT_ROLES = ["감시자", "타격대", "척후대", "전략가"];

interface DummyPlayer {
  discordName: string;
  riotId?: string;         // "gameName#tagLine"
  cachedTierName?: string;
  cachedTierId?: number;
  valorantRole?: string;
  favoriteAgents?: string[]; // max 3 agent names
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, guild } = await getAdminSession();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await context.params;
  const scrim = await prisma.scrimSession.findFirst({
    where: { id, ...(guild ? { guildId: guild.id } : {}) },
  });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const players: DummyPlayer[] = Array.isArray(body.players) ? body.players : [];

  if (players.length === 0) {
    return Response.json({ error: "더미 플레이어 데이터가 비어 있습니다." }, { status: 400 });
  }
  if (players.length > 20) {
    return Response.json({ error: "한 번에 최대 20명까지 추가할 수 있습니다." }, { status: 400 });
  }

  const added: string[] = [];

  for (const player of players) {
    const name = player.discordName?.trim();
    if (!name) continue;

    // generate a stable fake discord ID based on scrim id + player name
    const fakeId = `dummy_${scrim.id}_${name.replace(/\s+/g, "_").toLowerCase()}`.slice(0, 64);

    const valorantRole = VALORANT_ROLES.includes(player.valorantRole ?? "") ? player.valorantRole! : null;
    const favoriteAgents = Array.isArray(player.favoriteAgents)
      ? JSON.stringify(player.favoriteAgents.slice(0, 3))
      : "[]";

    const appUser = await prisma.user.upsert({
      where: { discordId: fakeId },
      update: {
        name,
        valorantRole,
        favoriteAgents,
      },
      create: {
        discordId: fakeId,
        email: `${fakeId}@dummy`,
        name,
        valorantRole,
        favoriteAgents,
      },
    });

    // upsert riot account if riotId provided
    if (player.riotId?.includes("#")) {
      const [gameName, tagLine] = player.riotId.split("#");
      if (gameName && tagLine) {
        const fakePuuid = `dummy-puuid-${fakeId}`.slice(0, 64);
        await prisma.riotAccount.upsert({
          where: { puuid: fakePuuid },
          update: {
            gameName: gameName.trim(),
            tagLine: tagLine.trim(),
            cachedTierName: player.cachedTierName ?? null,
            cachedTierId: player.cachedTierId ?? null,
          },
          create: {
            userId: appUser.id,
            puuid: fakePuuid,
            gameName: gameName.trim(),
            tagLine: tagLine.trim(),
            region: "KR",
            cachedTierName: player.cachedTierName ?? null,
            cachedTierId: player.cachedTierId ?? null,
          },
        });
      }
    }

    await prisma.scrimPlayer.upsert({
      where: { sessionId_userId: { sessionId: scrim.id, userId: appUser.id } },
      update: {},
      create: {
        sessionId: scrim.id,
        userId: appUser.id,
        team: "participant",
        role: "participant",
      },
    });

    if (guild) {
      await prisma.guildMember.upsert({
        where: { userId_guildId: { userId: appUser.id, guildId: scrim.guildId } },
        update: {},
        create: {
          userId: appUser.id,
          guildId: scrim.guildId,
          nickname: null,
        },
      });
    }

    added.push(name);
  }

  return Response.json({ success: true, added });
}
