import { auth } from "@/lib/auth";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인 필요" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  for (const [key, channelId] of Object.entries(CHANNELS)) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "valorant-dashboard/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      results[`${key}_rss`] = {
        status: r.status,
        ok: r.ok,
        preview: body.slice(0, 300),
        entryCount: (body.match(/<entry>/g) ?? []).length,
      };
    } catch (e) {
      results[`${key}_rss`] = { error: String(e) };
    }
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  results.hasApiKey = Boolean(apiKey);

  if (apiKey) {
    for (const [key, channelId] of Object.entries(CHANNELS)) {
      const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&maxResults=4&type=video`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const body = await r.json() as Record<string, unknown>;
        results[`${key}_api`] = { status: r.status, ok: r.ok, itemCount: Array.isArray(body.items) ? (body.items as unknown[]).length : 0 };
      } catch (e) {
        results[`${key}_api`] = { error: String(e) };
      }
    }
  }

  return Response.json(results);
}
