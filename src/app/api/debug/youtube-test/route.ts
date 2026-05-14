import { auth } from "@/lib/auth";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

const INVIDIOUS_INSTANCES = [
  "https://inv.tux.pizza",
  "https://invidious.lunar.icu",
  "https://yt.artemislena.eu",
  "https://invidious.privacyredirect.com",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
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
    const uploadsPlaylistId = "UU" + channelId.slice(2);

    // RSS channel_id 방식
    try {
      const r = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        { headers: { "user-agent": "Mozilla/5.0 Chrome/124.0" }, signal: AbortSignal.timeout(6000) }
      );
      const body = await r.text();
      results[`${key}_rss_channel`] = { status: r.status, ok: r.ok, entries: (body.match(/<entry>/g) ?? []).length };
    } catch (e) {
      results[`${key}_rss_channel`] = { error: String(e) };
    }

    // RSS playlist_id 방식 (UU prefix)
    try {
      const r = await fetch(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=${uploadsPlaylistId}`,
        { headers: { "user-agent": "Mozilla/5.0 Chrome/124.0" }, signal: AbortSignal.timeout(6000) }
      );
      const body = await r.text();
      results[`${key}_rss_playlist`] = { status: r.status, ok: r.ok, entries: (body.match(/<entry>/g) ?? []).length };
    } catch (e) {
      results[`${key}_rss_playlist`] = { error: String(e) };
    }

    // Invidious API
    for (const base of INVIDIOUS_INSTANCES) {
      const label = `${key}_inv_${base.replace("https://", "").replace(/\./g, "_")}`;
      try {
        const r = await fetch(`${base}/api/v1/channels/${channelId}/videos?fields=videos`, {
          headers: { "user-agent": "valorant-dashboard/1.0" },
          signal: AbortSignal.timeout(6000),
        });
        const body = r.ok ? await r.json() as Record<string, unknown> : {};
        const videos = Array.isArray(body.videos) ? body.videos as unknown[] : [];
        results[label] = { status: r.status, ok: r.ok, videoCount: videos.length };
      } catch (e) {
        results[label] = { error: String(e) };
      }
    }

    // Piped API
    for (const base of PIPED_INSTANCES) {
      const label = `${key}_piped_${base.replace("https://", "").replace(/\./g, "_")}`;
      try {
        const r = await fetch(`${base}/channel/${channelId}`, {
          headers: { "user-agent": "valorant-dashboard/1.0" },
          signal: AbortSignal.timeout(6000),
        });
        const body = r.ok ? await r.json() as Record<string, unknown> : {};
        const streams = Array.isArray(body.relatedStreams) ? body.relatedStreams as unknown[] : [];
        results[label] = { status: r.status, ok: r.ok, videoCount: streams.length };
      } catch (e) {
        results[label] = { error: String(e) };
      }
    }
  }

  if (apiKey) {
    for (const [key, channelId] of Object.entries(CHANNELS)) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&maxResults=4&type=video`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const body = await r.json() as Record<string, unknown>;
        results[`${key}_yt_api`] = { status: r.status, ok: r.ok, itemCount: Array.isArray(body.items) ? (body.items as unknown[]).length : 0 };
      } catch (e) {
        results[`${key}_yt_api`] = { error: String(e) };
      }
    }
  }

  return Response.json(results);
}
