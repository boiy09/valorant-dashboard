import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guildDiscordId = req.nextUrl.searchParams.get("guildId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10");

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : null;

  const sessions = await prisma.scrimSession.findMany({
    where: guild ? { guildId: guild.id } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      players: {
        include: { user: { select: { name: true, image: true, riotGameName: true } } },
      },
    },
  });

  return Response.json({ sessions });
}

export async function POST(req: NextRequest) {
  const { session, guild, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { title, description, scheduledAt, channelId, settings, mode } = await req.json();

  if (!title?.trim()) return Response.json({ error: "제목을 입력해 주세요." }, { status: 400 });

  const scrim = await prisma.scrimSession.create({
    data: {
      guildId: guild.id,
      title: title.trim(),
      description: description?.trim() ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      recruitmentChannelId: channelId ?? null,
      settings: settings ? JSON.stringify(settings) : "{}",
      mode: mode ?? "normal",
      status: "waiting",
      createdBy: session.user.id,
    },
  });

  // Best-effort: post recruitment message to Discord channel
  const token = process.env.DISCORD_BOT_TOKEN;
  if (token && channelId) {
    try {
      const lines: string[] = [`📣 **${scrim.title}**`];
      if (scrim.description) lines.push(scrim.description);
      if (scrim.scheduledAt) {
        lines.push(
          `\n🗓 내전 날짜: ${scrim.scheduledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
        );
      }
      lines.push("\n✅ 이 메시지에 반응을 남기면 참가자로 등록됩니다.");

      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.join("\n") }),
      });

      if (res.ok) {
        const msg = (await res.json()) as { id?: string };
        if (msg.id) {
          await prisma.scrimSession.update({
            where: { id: scrim.id },
            data: { recruitmentMessageIds: msg.id },
          });
        }
      }
    } catch {
      // Discord posting is best-effort; scrim is already created
    }
  }

  return Response.json({
    scrim: {
      ...scrim,
      scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
      createdAt: scrim.createdAt.toISOString(),
      startedAt: null,
      endedAt: null,
      players: [],
    },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "삭제할 내전 ID가 없습니다." }, { status: 400 });

  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  await prisma.scrimSession.delete({ where: { id } });

  return Response.json({ success: true });
}
