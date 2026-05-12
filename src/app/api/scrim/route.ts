import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { fetchDiscordChannel, isTextRecruitmentChannel } from "@/lib/scrimRecruitmentChannels";

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
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3)`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentChannelId" TEXT`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "recruitmentMessageIds" TEXT NOT NULL DEFAULT ''`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "managers" TEXT NOT NULL DEFAULT ''`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimPlayer" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'participant'`),
      prisma.$executeRawUnsafe(`ALTER TABLE "ScrimSession" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'normal'`),
      prisma.$executeRawUnsafe(`ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "allowedScrimChannelIds" TEXT NOT NULL DEFAULT '[]'`),
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

function parseMessageIds(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

async function getAllowedScrimChannelIds(guildId: string): Promise<string[]> {
  try {
    const result = await prisma.$queryRawUnsafe<{ allowedScrimChannelIds: string }[]>(
      `SELECT "allowedScrimChannelIds" FROM "Guild" WHERE id = $1 LIMIT 1`,
      guildId
    );
    const raw = result[0]?.allowedScrimChannelIds ?? "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function validateRecruitmentChannel(channelId: string, guildId?: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token is missing.");

  // 허용 채널 ID 목록에 있으면 이름 검사 없이 통과
  if (guildId) {
    const allowedIds = await getAllowedScrimChannelIds(guildId);
    if (allowedIds.includes(channelId)) return true;
  }

  const channel = await fetchDiscordChannel(channelId, token);
  return Boolean(channel && isTextRecruitmentChannel(channel));
}

async function sendRecruitmentMessage(params: {
  channelId: string;
  scrimId: string;
  title: string;
  description: string;
  scheduledAt: Date | null;
  extraNotice?: string;
}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token is missing.");

  const appUrl = (process.env.NEXTAUTH_URL ?? "https://valorant-dashboard-henna.vercel.app").replace(/\/$/, "");
  const detailUrl = `${appUrl}/dashboard/scrim/${params.scrimId}`;
  const description = [
    params.extraNotice ? `🚨 **${params.extraNotice}** 🚨` : null,
    params.description || "내전 참가자를 모집합니다.",
    params.scheduledAt
      ? `시작 시간: ${params.scheduledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
      : null,
    "참가하려면 이 메시지에 아무 이모지나 눌러 주세요.",
    `상세 페이지: ${detailUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch(`https://discord.com/api/v10/channels/${params.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      embeds: [
        {
          color: params.extraNotice ? 0xffb000 : 0xff4655,
          title: params.extraNotice ? `🚨 추가 모집중! ${params.title}` : params.title,
          description,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Discord message send failed: ${response.status}`);
  const message = (await response.json()) as { id?: string };
  if (!message.id) throw new Error("Discord message id was not returned.");

  return message.id;
}

async function deleteRecruitmentMessage(channelId: string, messageId: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
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
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills);

  // Fetch user details for Discord nicknames and tier info
  const userIds = kdRanking.map(p => p.userId);
  const usersWithDetails = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true, // Discord nickname
      riotAccounts: {
        select: {
          cachedTierName: true,
          region: true,
        },
      },
    },
  });

  const userDetailsMap = new Map(usersWithDetails.map(u => [u.id, u]));

  // Function to get tier icon URL based on tier name
  function getTierIconUrl(tierName: string | null): string | null {
    if (!tierName) return "/images/tiers/unranked.png";
    const tierIcons: { [key: string]: string } = {
      "아이언": "/images/tiers/iron.png",
      "브론즈": "/images/tiers/bronze.png",
      "실버": "/images/tiers/silver.png",
      "골드": "/images/tiers/gold.png",
      "플래티넘": "/images/tiers/platinum.png",
      "다이아몬드": "/images/tiers/diamond.png",
      "초월자": "/images/tiers/ascendant.png",
      "불멸": "/images/tiers/immortal.png",
      "레디언트": "/images/tiers/radiant.png",
      "언랭크": "/images/tiers/unranked.png",
    };
    for (const [key, url] of Object.entries(tierIcons)) {
      if (tierName && tierName.includes(key)) return url;
    }
    return "/images/tiers/unranked.png";
  }

  const finalKdRanking = kdRanking.slice(0, 20).map(player => {
    const userDetail = userDetailsMap.get(player.userId);
    const primaryAccount = userDetail?.riotAccounts?.[0];
    const tierName = primaryAccount?.cachedTierName || "언랭크";
    const region = primaryAccount?.region || "KR";
    const tierIconUrl = getTierIconUrl(tierName);
    const regionLabel = region === "KR" ? "한섭" : "아섭";

    return {
      ...player,
      name: userDetail?.name || player.name, // Use Discord nickname if available
      tierName,
      tierIconUrl,
      region,
      regionLabel,
    };
  });

  return Response.json({ sessions, kdRanking: finalKdRanking });
}

export async function POST(req: NextRequest) {
  await ensureScrimSessionColumns();

  const { session, user, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user) return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
  const scheduledAt = typeof body.scheduledAt === "string" && body.scheduledAt ? new Date(body.scheduledAt) : null;
  const mode = body.mode === "auction" ? "auction" : "normal";

  if (!title) return Response.json({ error: "내전 제목을 입력해 주세요." }, { status: 400 });
  if (!channelId) return Response.json({ error: "모집 글을 올릴 채널을 선택해 주세요." }, { status: 400 });
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return Response.json({ error: "시작 시간이 올바르지 않습니다." }, { status: 400 });
  }
  // 관리자/발로네끼는 채널 이름 검증 없이 어떤 채널이든 허용, 일반 멤버도 어떤 채널이든 허용
  // (모든 멤버 내전 생성 가능)

  const scrim = await prisma.scrimSession.create({
    data: {
      guildId: guild.id,
      title,
      description: description || null,
      settings: JSON.stringify(normalizeSettings(body.settings)),
      scheduledAt,
      recruitmentChannelId: channelId,
      recruitmentMessageIds: JSON.stringify([]),
      managers: JSON.stringify([session.user.id]),
      status: "waiting",
      mode,
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

  const messageId = await sendRecruitmentMessage({ channelId, scrimId: scrim.id, title, description, scheduledAt });
  const updatedScrim = await prisma.scrimSession.update({
    where: { id: scrim.id },
    data: { recruitmentMessageIds: JSON.stringify([messageId]) },
    include: {
      players: {
        include: {
          user: { select: { id: true, name: true, image: true, riotGameName: true } },
        },
      },
    },
  });

  return Response.json({ success: true, scrim: updatedScrim });
}

export async function PUT(req: NextRequest) {
  await ensureScrimSessionColumns();

  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "내전 ID가 필요합니다." }, { status: 400 });

  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });
  if (!scrim.recruitmentChannelId) {
    return Response.json({ error: "기존 모집 채널 정보가 없습니다." }, { status: 400 });
  }
  // 관리자/발로네끼 역할이면 채널 이름 검증 없이 어떤 채널이든 허용
  if (!isAdmin && !(await validateRecruitmentChannel(scrim.recruitmentChannelId, guild.id))) {
    return Response.json({ error: "추가 모집은 이벤트 공지 또는 구인-구직 채널에서만 가능합니다." }, { status: 400 });
  }

  const messageId = await sendRecruitmentMessage({
    channelId: scrim.recruitmentChannelId,
    scrimId: scrim.id,
    title: scrim.title,
    description: scrim.description ?? "",
    scheduledAt: scrim.scheduledAt,
    extraNotice: "추가 모집중! 아직 참가할 수 있습니다.",
  });
  const nextIds = Array.from(new Set([...parseMessageIds(scrim.recruitmentMessageIds), messageId]));

  await prisma.scrimSession.update({
    where: { id: scrim.id },
    data: { recruitmentMessageIds: JSON.stringify(nextIds) },
  });

  return Response.json({ success: true, messageId });
}

export async function DELETE(req: NextRequest) {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "내전 ID가 필요합니다." }, { status: 400 });

  const scrim = await prisma.scrimSession.findUnique({ where: { id } });
  if (!scrim) return Response.json({ error: "삭제할 내전 기록을 찾을 수 없습니다." }, { status: 404 });

  // 1. 디스코드 메시지 삭제 시도
  try {
    const messageIds = JSON.parse(scrim.recruitmentMessageIds || "[]");
    if (scrim.recruitmentChannelId && messageIds.length > 0) {
      for (const msgId of messageIds) {
        await deleteRecruitmentMessage(scrim.recruitmentChannelId, msgId).catch(e => 
          console.error(`디스코드 메시지 삭제 실패 (${msgId}):`, e)
        );
      }
    }
  } catch (e) {
    console.error("디스코드 메시지 삭제 프로세스 오류:", e);
  }

  // 2. DB 데이터 삭제
  await prisma.scrimSession.delete({ where: { id } });

  return Response.json({ success: true });
}
