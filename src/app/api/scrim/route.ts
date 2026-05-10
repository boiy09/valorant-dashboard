import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const DEFAULT_SETTINGS = {
  showRiotNickname: true,
  showDiscordNickname: true,
  showRankTier: true,
  showValorantRole: true,
  showFavoriteAgents: true,
};

let scrimColumnsPromise: Promise<void> | null = null;

function ensureScrimSessionColumns() {
  if (!scrimColumnsPromise) {
    scrimColumnsPromise = Promise.all([
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "description" TEXT`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "settings" TEXT NOT NULL DEFAULT ''`),
    ])
      .then(() => undefined)
      .catch((error) => {
        scrimColumnsPromise = null;
        throw error;
      });
  }

  return scrimColumnsPromise;
}

function calculateKd(kills: number, deaths: number) {
  if (deaths <= 0) return kills;
  return Number((kills / deaths).toFixed(2));
}

function normalizeSettings(value: unknown) {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const input = value as Partial<Record<keyof typeof DEFAULT_SETTINGS, unknown>>;

  return {
    showRiotNickname: input.showRiotNickname !== false,
    showDiscordNickname: input.showDiscordNickname !== false,
    showRankTier: input.showRankTier !== false,
    showValorantRole: input.showValorantRole !== false,
    showFavoriteAgents: input.showFavoriteAgents !== false,
  };
}

export async function GET(req: NextRequest) {
  await ensureScrimSessionColumns();

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  const guildFilter = guild ? { guildId: guild.id } : undefined;

  const [sessions, players] = await Promise.all([
    prisma.scrimSession.findMany({
      where: guildFilter,
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 20,
      include: {
        players: {
          include: {
            user: { select: { id: true, name: true, image: true, riotGameName: true } },
          },
        },
      },
    }),
    prisma.scrimPlayer.findMany({
      where: guild ? { session: { guildId: guild.id } } : undefined,
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    }),
  ]);

  const rankingMap = new Map<
    string,
    {
      userId: string;
      name: string | null;
      image: string | null;
      kills: number;
      deaths: number;
      assists: number;
      matches: number;
    }
  >();

  for (const player of players) {
    if (player.kills === null && player.deaths === null && player.assists === null) continue;

    const current = rankingMap.get(player.userId) ?? {
      userId: player.userId,
      name: player.user.name,
      image: player.user.image,
      kills: 0,
      deaths: 0,
      assists: 0,
      matches: 0,
    };

    current.kills += player.kills ?? 0;
    current.deaths += player.deaths ?? 0;
    current.assists += player.assists ?? 0;
    current.matches += 1;
    rankingMap.set(player.userId, current);
  }

  const kdRanking = Array.from(rankingMap.values())
    .map((player) => ({
      ...player,
      kd: calculateKd(player.kills, player.deaths),
    }))
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills)
    .slice(0, 20);

  return Response.json({ sessions, kdRanking });
}

export async function POST(req: NextRequest) {
  await ensureScrimSessionColumns();

  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title) {
    return Response.json({ error: "내전 제목을 입력해 주세요." }, { status: 400 });
  }

  const scrim = await prisma.scrimSession.create({
    data: {
      guildId: guild.id,
      title,
      description: description || null,
      settings: JSON.stringify(normalizeSettings(body.settings)),
      status: "waiting",
      createdBy: session.user.id,
    },
    include: {
      players: {
        include: {
          user: { select: { id: true, name: true, image: true, riotGameName: true } },
        },
      },
    },
  });

  return Response.json({ success: true, scrim });
}

export async function DELETE(req: NextRequest) {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "내전 ID가 필요합니다." }, { status: 400 });

  const deleted = await prisma.scrimSession.deleteMany({
    where: {
      id,
      ...(guild ? { guildId: guild.id } : {}),
    },
  });

  if (deleted.count === 0) {
    return Response.json({ error: "삭제할 내전 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ success: true });
}
