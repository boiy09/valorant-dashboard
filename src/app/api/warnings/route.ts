import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const warnings = await prisma.warning.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
    include: {
      user: {
        select: {
          name: true,
          image: true,
          discordId: true,
          guilds: { select: { nickname: true }, take: 1 },
        },
      },
    },
  });

  return Response.json({
    warnings: warnings.map((w) => ({
      ...w,
      user: {
        name: w.user.guilds[0]?.nickname ?? w.user.name,
        image: w.user.image,
        discordId: w.user.discordId,
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  const { isAdmin, guild: sessionGuild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 또는 발로네끼 권한이 필요합니다." }, { status: 403 });

  const guild = sessionGuild ?? (await prisma.guild.findFirst());
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { discordId, reason, note } = body as { discordId?: string; reason?: string; note?: string };

  if (!discordId || !reason?.trim()) {
    return Response.json({ error: "멤버와 경고 사유를 입력해주세요." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return Response.json({ error: "해당 멤버를 찾을 수 없습니다." }, { status: 404 });

  const warning = await prisma.warning.create({
    data: {
      userId: user.id,
      guildId: guild.id,
      reason: reason.trim(),
      note: note?.trim() || null,
      issuedBy: "관리자 (웹)",
      active: true,
    },
    include: {
      user: {
        select: {
          name: true,
          image: true,
          discordId: true,
          guilds: { select: { nickname: true }, take: 1 },
        },
      },
    },
  });

  return Response.json({
    warning: {
      ...warning,
      user: {
        name: warning.user.guilds[0]?.nickname ?? warning.user.name,
        image: warning.user.image,
        discordId: warning.user.discordId,
      },
    },
  });
}
