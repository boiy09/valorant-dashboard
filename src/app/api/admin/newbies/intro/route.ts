import { getAdminSession } from "@/lib/admin";

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

// 채널 전체 메시지 조회 — 찾아야 할 Discord ID 목록을 전달하면 모두 발견 시 조기 종료
async function fetchChannelMessages(
  token: string,
  targetIds: Set<string>
): Promise<DiscordMessage[]> {
  const headers = { Authorization: `Bot ${token}` };
  const messages: DiscordMessage[] = [];
  const found = new Set<string>();

  let before: string | undefined;
  // 최대 20페이지(2000개)까지 조회, 모든 대상자 발견 시 조기 종료
  for (let page = 0; page < 20; page++) {
    const qs = before ? `?limit=100&before=${before}` : "?limit=100";
    const res = await fetch(`${DISCORD_API}/channels/${INTRO_CHANNEL_ID}/messages${qs}`, {
      headers,
      cache: "no-store",
    });

    if (res.status === 429) {
      // rate limit — retry-after 헤더 기다린 후 재시도
      const retryAfter = Number(res.headers.get("retry-after") ?? "1") * 1000;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5000)));
      continue; // 같은 페이지 재시도
    }

    if (!res.ok) break;

    const batch = await res.json() as DiscordMessage[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    messages.push(...batch);

    for (const msg of batch) {
      if (targetIds.has(msg.author.id)) found.add(msg.author.id);
    }

    // 모든 대상자를 발견했으면 더 이상 조회 불필요
    if (targetIds.size > 0 && found.size >= targetIds.size) break;

    before = batch[batch.length - 1].id;
  }

  return messages;
}

export async function GET(req: Request) {
  try {
    let isAdmin = false;
    try {
      const session = await getAdminSession();
      isAdmin = session.isAdmin;
    } catch {
      return Response.json({ error: "DB unavailable" }, { status: 503 });
    }
    if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return Response.json({ error: "Bot token not configured" }, { status: 500 });

    const url = new URL(req.url);
    const idsParam = url.searchParams.get("ids");
    const targetIds = new Set<string>(idsParam ? idsParam.split(",").filter(Boolean) : []);

    const messages = await fetchChannelMessages(token, targetIds);

    // discordId → 메시지 목록 (오래된 순)
    const byAuthor = new Map<string, Array<{ content: string; timestamp: string; hasAttachments: boolean }>>();
    for (const msg of [...messages].reverse()) {
      const entry = { content: msg.content, timestamp: msg.timestamp, hasAttachments: msg.attachments.length > 0 };
      const existing = byAuthor.get(msg.author.id);
      if (existing) existing.push(entry);
      else byAuthor.set(msg.author.id, [entry]);
    }

    const debug = url.searchParams.get("debug") === "1";
    return Response.json({
      intros: Object.fromEntries(byAuthor),
      ...(debug && {
        _debug: {
          totalMessages: messages.length,
          foundAuthorIds: [...byAuthor.keys()],
          targetIds: [...targetIds],
        },
      }),
    });
  } catch (e) {
    console.error("[intro] failed:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
