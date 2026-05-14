import { NextRequest, NextResponse } from "next/server";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

type Channel = keyof typeof CHANNELS;

interface VideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
}

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

async function fetchViaRss(channelId: string): Promise<VideoItem[]> {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    {
      next: { revalidate: 60 * 20 },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    }
  );
  if (!response.ok) throw new Error(`RSS ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map((match) => {
    const entry = match[1];
    const videoId = firstMatch(entry, /<yt:videoId>(.*?)<\/yt:videoId>/);
    const url = firstMatch(entry, /<link rel="alternate" href="(.*?)"\//);
    return {
      id: videoId,
      title: firstMatch(entry, /<title>([\s\S]*?)<\/title>/),
      url: url || `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: firstMatch(entry, /<media:thumbnail url="(.*?)"/),
      publishedAt: firstMatch(entry, /<published>(.*?)<\/published>/),
    };
  });
}

interface YoutubeApiSnippet {
  title?: string;
  publishedAt?: string;
  thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
}

interface YoutubeApiItem {
  id?: { videoId?: string };
  snippet?: YoutubeApiSnippet;
}

async function fetchViaApi(channelId: string, apiKey: string): Promise<VideoItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", "4");
  url.searchParams.set("type", "video");

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 * 20 },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json() as { items?: YoutubeApiItem[] };
  return (data.items ?? []).map((item) => {
    const videoId = item.id?.videoId ?? "";
    const snippet = item.snippet ?? {};
    const thumb = snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.high?.url ?? "";
    return {
      id: videoId,
      title: snippet.title ?? "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: thumb,
      publishedAt: snippet.publishedAt ?? "",
    };
  });
}

export async function GET(req: NextRequest) {
  const channel: Channel = req.nextUrl.searchParams.get("channel") === "global" ? "global" : "kr";
  const channelId = CHANNELS[channel];
  const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    let videos: VideoItem[];
    if (apiKey) {
      videos = await fetchViaApi(channelId, apiKey);
    } else {
      videos = await fetchViaRss(channelId);
    }
    return NextResponse.json({ videos });
  } catch (e) {
    console.error(`[youtube/latest] ${channel} 피드 실패 (${apiKey ? "API" : "RSS"}):`, e);

    if (apiKey) {
      try {
        const videos = await fetchViaRss(channelId);
        return NextResponse.json({ videos });
      } catch (e2) {
        console.error(`[youtube/latest] ${channel} RSS 폴백도 실패:`, e2);
      }
    }

    return NextResponse.json({ videos: [] });
  }
}
