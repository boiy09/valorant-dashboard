import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/broadcast";

export const dynamic = "force-dynamic";

type DiscordAttachment = {
  id: string;
  filename?: string;
  url?: string;
  proxy_url?: string;
};

type HighlightWithUser = Awaited<ReturnType<typeof getHighlights>>[number];

function parseDiscordMessageUrl(url: string | null | undefined) {
  if (!url) return null;
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

function isDiscordAttachmentUrl(url: string) {
  return /(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\//.test(url);
}

function shouldRefreshDiscordAttachmentUrl(url: string) {
  if (!isDiscordAttachmentUrl(url)) return false;

  const expiresAt = (() => {
    try {
      return new URL(url).searchParams.get("ex");
    } catch {
      return null;
    }
  })();
  if (!expiresAt) return true;

  const expiresAtSeconds = Number.parseInt(expiresAt, 16);
  if (!Number.isFinite(expiresAtSeconds)) return true;

  return expiresAtSeconds * 1000 < Date.now() + 30 * 60 * 1000;
}

function selectFreshAttachmentUrl(highlight: HighlightWithUser, attachments: DiscordAttachment[]) {
  const oldUrl = highlight.url;
  const title = highlight.title.toLowerCase();

  const attachment =
    attachments.find((item) => item.id && oldUrl.includes(item.id)) ??
    attachments.find((item) => item.filename && item.filename.toLowerCase() === title) ??
    attachments.find((item) => item.filename && title.includes(item.filename.toLowerCase())) ??
    attachments[0];

  return attachment?.url ?? attachment?.proxy_url ?? null;
}

async function getFreshDiscordAttachmentUrl(highlight: HighlightWithUser) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !shouldRefreshDiscordAttachmentUrl(highlight.url)) return null;

  const messageRef = parseDiscordMessageUrl(highlight.description);
  if (!messageRef) return null;

  const response = await fetch(
    `https://discord.com/api/v10/channels/${messageRef.channelId}/messages/${messageRef.messageId}`,
    {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    }
  ).catch(() => null);

  if (!response?.ok) return null;

  const message = (await response.json().catch(() => null)) as { attachments?: DiscordAttachment[] } | null;
  if (!message?.attachments?.length) return null;

  return selectFreshAttachmentUrl(highlight, message.attachments);
}

async function refreshHighlightUrl(highlight: HighlightWithUser) {
  const freshUrl = await getFreshDiscordAttachmentUrl(highlight);
  if (!freshUrl || freshUrl === highlight.url) return highlight;

  await prisma.highlight.update({
    where: { id: highlight.id },
    data: { url: freshUrl },
  }).catch(() => null);

  return { ...highlight, url: freshUrl };
}

async function getHighlights(type: string, limit: number) {
  return prisma.highlight.findMany({
    where: { type },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          discordId: true,
          guilds: { select: { guildId: true, nickname: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function serializeHighlight(highlight: HighlightWithUser, likedByMe = false) {
  const serverNickname =
    highlight.user?.guilds.find((member) => member.guildId === highlight.guildId)?.nickname ?? null;

  return {
    ...highlight,
    user: highlight.user
      ? {
          name: serverNickname ?? highlight.user.name,
          image: highlight.user.image,
          discordId: highlight.user.discordId,
        }
      : null,
    likedByMe,
  };
}

async function getUser(session: any) {
  let user = await prisma.user.findUnique({ where: { discordId: session.user.id } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  return user;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const type = req.nextUrl.searchParams.get("type") ?? "clip";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  const highlights = await Promise.all((await getHighlights(type, limit)).map(refreshHighlightUrl));
  const user = session?.user?.id ? await getUser(session) : null;
  const likedIds = new Set<string>();
  if (user && highlights.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ highlightId: string }>>`
      SELECT "highlightId"
      FROM "HighlightLike"
      WHERE "userId" = ${user.id}
    `.catch(() => []);
    const highlightIds = new Set(highlights.map((highlight) => highlight.id));
    for (const row of rows) {
      if (highlightIds.has(row.highlightId)) likedIds.add(row.highlightId);
    }
  }

  return Response.json(
    { highlights: highlights.map((highlight) => serializeHighlight(highlight, likedIds.has(highlight.id))) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const user = await getUser(session);
  if (!user) return Response.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 });

  const { title, description, url, type, guildDiscordId } = await req.json();
  if (!title?.trim() || !url?.trim()) {
    return Response.json({ error: "제목과 URL을 입력해주세요." }, { status: 400 });
  }

  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();
  if (!guild) return Response.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: guild.id } },
  });
  if (!member) return Response.json({ error: "해당 서버의 멤버가 아닙니다." }, { status: 403 });

  const highlight = await prisma.highlight.create({
    data: { userId: user.id, guildId: guild.id, title, description, url, type: type ?? "clip" },
  });

  broadcast("highlight", { action: "created" }).catch(() => {});
  return Response.json({ success: true, highlight });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { highlightId, id } = await req.json();
  const targetId = highlightId ?? id;
  if (!targetId) return Response.json({ error: "하이라이트 ID가 필요합니다." }, { status: 400 });

  const user = await getUser(session);
  if (!user) return Response.json({ error: "?좎?瑜?李얠쓣 ???놁뒿?덈떎." }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "HighlightLike"
      WHERE "highlightId" = ${targetId}
      AND "userId" = ${user.id}
      LIMIT 1
    `;

    if (existing[0]) {
      await tx.$executeRaw`
        DELETE FROM "HighlightLike"
        WHERE "highlightId" = ${targetId}
        AND "userId" = ${user.id}
      `;
      const rows = await tx.$queryRaw<Array<{ likes: number }>>`
        UPDATE "Highlight"
        SET "likes" = GREATEST("likes" - 1, 0)
        WHERE "id" = ${targetId}
        RETURNING "likes"
      `;
      return { liked: false, likes: rows[0]?.likes ?? 0 };
    }

    await tx.$executeRaw`
      INSERT INTO "HighlightLike" ("id", "highlightId", "userId")
      VALUES (${randomUUID()}, ${targetId}, ${user.id})
    `;
    const highlight = await tx.highlight.update({
      where: { id: targetId },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
    return { liked: true, likes: highlight.likes };
  });

  broadcast("highlight", { action: "liked" }).catch(() => {});
  return Response.json({ success: true, ...result });
}
