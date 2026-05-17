import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

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
            data: { recruitmentMessageIds: JSON.stringify([msg.id]) },
          });
        }
      }
    } catch {
      // Discord posting is best-effort; scrim is already created
    }
  }

  broadcast("scrim", { action: "created", scrimId: scrim.id }).catch(() => {});

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

export async function PUT(req: NextRequest) {
  const { session, guild, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "내전 ID가 필요합니다." }, { status: 400 });

  const scrim = await prisma.scrimSession.findFirst({ where: { id, guildId: guild.id } });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });

  const managers = parseMessageIds(scrim.managers || scrim.createdBy);
  if (!isAdmin && !managers.includes(session.user.id)) {
    return Response.json({ error: "내전 관리자 권한이 필요합니다." }, { status: 403 });
  }

  if (!scrim.recruitmentChannelId) {
    return Response.json({ error: "모집 채널이 설정되어 있지 않습니다." }, { status: 400 });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return Response.json({ error: "Discord 봇 토큰이 설정되어 있지 않습니다." }, { status: 500 });
  }

  const lines: string[] = [`📣 **${scrim.title}**`];
  if (scrim.description) lines.push(scrim.description);
  if (scrim.scheduledAt) {
    lines.push(`\n🗓 내전 날짜: ${scrim.scheduledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  }
  lines.push("\n✅ 이 메시지에 반응을 남기면 참가자로 등록됩니다.");

  const discordRes = await fetch(`https://discord.com/api/v10/channels/${scrim.recruitmentChannelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: lines.join("\n") }),
  });

  if (!discordRes.ok) {
    const detail = await discordRes.text().catch(() => "");
    return Response.json(
      { error: detail ? `Discord 모집 글 작성 실패: ${detail.slice(0, 200)}` : "Discord 모집 글 작성에 실패했습니다." },
      { status: 502 }
    );
  }

  const message = (await discordRes.json().catch(() => null)) as { id?: string } | null;
  if (!message?.id) {
    return Response.json({ error: "Discord 모집 글 ID를 확인하지 못했습니다." }, { status: 502 });
  }

  const messageIds = [...parseMessageIds(scrim.recruitmentMessageIds), message.id];
  await prisma.scrimSession.update({
    where: { id: scrim.id },
    data: {
      recruitmentMessageIds: JSON.stringify(Array.from(new Set(messageIds)).slice(-5)),
      status: scrim.status === "waiting" ? "recruiting" : scrim.status,
    },
  });

  broadcast("scrim", { action: "recruitment_added", scrimId: scrim.id, messageId: message.id }).catch(() => {});

  return Response.json({ success: true, messageId: message.id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "삭제할 내전 ID가 없습니다." }, { status: 400 });

  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const scrim = await prisma.scrimSession.findUnique({
    where: { id },
    select: { recruitmentChannelId: true, recruitmentMessageIds: true },
  });

  await prisma.scrimSession.delete({ where: { id } });

  // Best-effort: Discord 모집 메시지 삭제
  const token = process.env.DISCORD_BOT_TOKEN;
  if (token && scrim?.recruitmentChannelId && scrim.recruitmentMessageIds) {
    const messageIds = parseMessageIds(scrim.recruitmentMessageIds);
    for (const messageId of messageIds) {
      await fetch(
        `https://discord.com/api/v10/channels/${scrim.recruitmentChannelId}/messages/${messageId}`,
        { method: "DELETE", headers: { Authorization: `Bot ${token}` } }
      ).catch(() => { /* best-effort */ });
    }
  }

  broadcast("scrim", { action: "deleted", scrimId: id }).catch(() => {});

  return Response.json({ success: true });
}

function parseMessageIds(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch { /* fall through */ }
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}
