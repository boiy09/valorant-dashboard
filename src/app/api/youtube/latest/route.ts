import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

const HANDLES = {
  kr: "@VALORANTkr",
  global: "@valorant",
} as const;

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function firstMatch(value: string, pattern: RegExp) {
  return decodeXml(value.match(pattern)?.[1]?.trim() ?? "");
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\u0026/g, "&");
  }
}

async function fetchFromChannelPage(channel: keyof typeof CHANNELS) {
  const response = await fetch(`https://www.youtube.com/${HANDLES[channel]}/videos`, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 valorant-dashboard/1.0",
      "accept-language": channel === "kr" ? "ko-KR,ko;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
    },
  });
  if (!response.ok) return [];

  const html = decodeXml(await response.text());
  const videos = new Map<string, { id: string; title: string }>();

  for (const match of html.matchAll(/"lockupViewModel":\{([\s\S]*?)"contentId":"([^"]+)"/g)) {
    const block = match[1];
    const id = match[2];
    const title = block.match(/"title":\{"content":"((?:\\.|[^"\\])*)"/)?.[1];
    if (!id || !title || videos.has(id)) continue;
    videos.set(id, { id, title: decodeJsonString(title) });
    if (videos.size >= 4) break;
  }

  return [...videos.values()].map((video) => ({
    id: video.id,
    title: video.title,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    publishedAt: new Date().toISOString(),
    channel,
  }));
}

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get("channel") === "global" ? "global" : "kr";
  const channelId = CHANNELS[channel];

  try {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      cache: "no-store",
      headers: { "user-agent": "valorant-dashboard/1.0" },
    });
    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map((match) => {
        const entry = match[1];
        const videoId = firstMatch(entry, /<yt:videoId>(.*?)<\/yt:videoId>/);
        const url = firstMatch(entry, /<link rel="alternate" href="(.*?)"\/>/);

        return {
          id: videoId,
          title: firstMatch(entry, /<title>([\s\S]*?)<\/title>/),
          url: url || `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: firstMatch(entry, /<media:thumbnail url="(.*?)"/),
          publishedAt: firstMatch(entry, /<published>(.*?)<\/published>/),
          channel,
        };
      })
      .filter((video) => video.id && video.title)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 4);

    if (entries.length > 0) return NextResponse.json({ videos: entries });

    const fallbackEntries = await fetchFromChannelPage(channel);
    return NextResponse.json({ videos: fallbackEntries });
  } catch {
    const fallbackEntries = await fetchFromChannelPage(channel).catch(() => []);
    return NextResponse.json({ videos: fallbackEntries });
  }
}
