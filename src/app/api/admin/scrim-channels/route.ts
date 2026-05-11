"use server";
import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// 허용 채널 ID 목록 파싱
function parseChannelIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

// Guild에서 allowedScrimChannelIds 가져오기 (런타임 컬럼)
async function getGuildChannelIds(guildId: string): Promise<string[]> {
  try {
    const result = await prisma.$queryRawUnsafe<{ allowedScrimChannelIds: string }[]>(
      `SELECT "allowedScrimChannelIds" FROM "Guild" WHERE id = $1 LIMIT 1`,
      guildId
    );
    return parseChannelIds(result[0]?.allowedScrimChannelIds);
  } catch {
    return [];
  }
}

// 채널 이름 조회 (Discord API)
async function fetchChannelName(channelId: string): Promise<string | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { name?: string };
    return data.name ?? null;
  } catch {
    return null;
  }
}

// GET: 현재 허용 채널 목록 조회
export async function GET() {
  const { isAdmin, guild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const channelIds = await getGuildChannelIds(guild.id);

  // 각 채널 이름 조회
  const channels = await Promise.all(
    channelIds.map(async (id) => ({
      id,
      name: await fetchChannelName(id),
    }))
  );

  return Response.json({ channels });
}

// POST: 채널 ID 추가
export async function POST(req: NextRequest) {
  const { isAdmin, guild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
  if (!channelId) return Response.json({ error: "채널 ID를 입력해 주세요." }, { status: 400 });
  if (!/^\d{17,20}$/.test(channelId)) return Response.json({ error: "올바른 Discord 채널 ID를 입력해 주세요. (17~20자리 숫자)" }, { status: 400 });

  const current = await getGuildChannelIds(guild.id);
  if (current.includes(channelId)) return Response.json({ error: "이미 등록된 채널 ID입니다." }, { status: 400 });

  const next = [...current, channelId];
  await prisma.$executeRawUnsafe(
    `UPDATE "Guild" SET "allowedScrimChannelIds" = $1 WHERE id = $2`,
    JSON.stringify(next),
    guild.id
  );

  const name = await fetchChannelName(channelId);
  return Response.json({ success: true, channel: { id: channelId, name } });
}

// DELETE: 채널 ID 제거
export async function DELETE(req: NextRequest) {
  const { isAdmin, guild } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
  if (!channelId) return Response.json({ error: "채널 ID를 입력해 주세요." }, { status: 400 });

  const current = await getGuildChannelIds(guild.id);
  const next = current.filter((id) => id !== channelId);
  await prisma.$executeRawUnsafe(
    `UPDATE "Guild" SET "allowedScrimChannelIds" = $1 WHERE id = $2`,
    JSON.stringify(next),
    guild.id
  );

  return Response.json({ success: true });
}
