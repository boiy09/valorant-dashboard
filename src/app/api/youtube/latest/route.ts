import { NextRequest, NextResponse } from "next/server";

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
      next: { revalidate: 60 * 20 },
      headers: { "user-agent": "valorant-dashboard/1.0" },
    });
    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map((match) => {
      const entry = match[1];
      const videoId = firstMatch(entry, /<yt:videoId>(.*?)<\/yt:videoId>/);
      const url = firstMatch(entry, /<link rel="alternate" href="(.*?)"\/>/);

      return {
        id: videoId,
        title: firstMatch(entry, /<title>([\s\S]*?)<\/title>/),
        url: url || `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: firstMatch(entry, /<media:thumbnail url="(.*?)"/)  ,
        publishedAt: firstMatch(entry, /<published>(.*?)<\/published>/),
        channel,
      };
    });

    return NextResponse.json({ videos: entries });
  } catch (e) {
    console.error("[youtube/latest] 유튜브 피드 파싱 실패:", e);
    return NextResponse.json({ videos: [] });
  }
}
