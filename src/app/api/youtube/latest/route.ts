import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
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

    return NextResponse.json({ videos: entries });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}
