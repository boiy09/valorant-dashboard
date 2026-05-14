import { auth } from "@/lib/auth";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인 필요" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const apiKey = process.env.YOUTUBE_API_KEY;
  results.hasApiKey = Boolean(apiKey);

  for (const [key, channelId] of Object.entries(CHANNELS)) {
    // RSS 테스트
    try {
      const r = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
          signal: AbortSignal.timeout(6000),
        }
      );
      const body = await r.text();
      results[`${key}_rss`] = {
        status: r.status,
        ok: r.ok,
        entryCount: (body.match(/<entry>/g) ?? []).length,
        preview: body.slice(0, 200),
      };
    } catch (e) {
      results[`${key}_rss`] = { error: String(e) };
    }

    // Piped API 테스트
    for (const base of PIPED_INSTANCES) {
      const label = `${key}_piped_${base.replace("https://", "").split(".")[0]}`;
      try {
        const r = await fetch(`${base}/channel/${channelId}`, {
          headers: { "user-agent": "valorant-dashboard/1.0" },
          signal: AbortSignal.timeout(6000),
        });
        const body = await r.json() as Record<string, unknown>;
        const streams = Array.isArray(body.relatedStreams) ? body.relatedStreams as unknown[] : [];
        results[label] = {
          status: r.status,
          ok: r.ok,
          videoCount: streams.length,
          firstTitle: streams.length > 0 ? (streams[0] as Record<string, unknown>).title : null,
        };
      } catch (e) {
        results[label] = { error: String(e) };
      }
    }
  }

  return Response.json(results);
}
