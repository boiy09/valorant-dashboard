import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

const INTRO_CHANNEL_ID = "1343592307164844115";
const DISCORD_API = "https://discord.com/api/v10";

interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name: string | null };
  attachments: Array<{ url: string; filename: string }>;
}

// 채널 메시지 최대 200개 조회 (100개씩 2페이지)
async function fetchChannelMessages(token: string): Promise<DiscordMessage[]> {
  const headers = { Authorization: `Bot ${token}` };
  const messages: DiscordMessage[] = [];

  let before: string | undefined;
  for (let page = 0; page < 2; page++) {
    const qs = before ? `?limit=100&before=${before}` : "?limit=100";
    const res = await fetch(`${DISCORD_API}/channels/${INTRO_CHANNEL_ID}/messages${qs}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) break;
    const batch = await res.json() as DiscordMessage[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    messages.push(...batch);
    before = batch[batch.length - 1].id;
  }

  return messages;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 관리자 확인
  const user = await prisma.user.findUnique({
    where: { id: session.user.id! },
    select: { guilds: { select: { roles: true } } },
  });
  const roles: string[] = user?.guilds?.flatMap((g) => {
    try { return JSON.parse(g.roles) as string[]; } catch { return []; }
  }) ?? [];
  const isAdmin = roles.some((r) => ["관리자", "부운영자", "팀장"].includes(r));
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return Response.json({ error: "Bot token not configured" }, { status: 500 });

  try {
    const messages = await fetchChannelMessages(token);

    // discordId → 마지막(가장 최근) 메시지 매핑
    const byAuthor = new Map<string, { content: string; timestamp: string; hasAttachments: boolean }>();
    for (const msg of messages) {
      const existing = byAuthor.get(msg.author.id);
      if (!existing || msg.timestamp > existing.timestamp) {
        byAuthor.set(msg.author.id, {
          content: msg.content,
          timestamp: msg.timestamp,
          hasAttachments: msg.attachments.length > 0,
        });
      }
    }

    return Response.json({
      intros: Object.fromEntries(byAuthor),
    });
  } catch (e) {
    console.error("[intro] failed:", e);
    return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
