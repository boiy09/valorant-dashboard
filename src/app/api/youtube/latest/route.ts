import { NextRequest, NextResponse } from "next/server";

const CHANNELS = {
  kr: "UC9M8GGVwPqc9ubNruArCNPg",
  global: "UC8CX0LD98EDXl4UYX1MDCXg",
} as const;

// Public Piped API instances (fallback when no API key)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
];

type Channel = keyof typeof CHANNELS;

interface VideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
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

interface PipedVideo {
  url?: string;
  title?: string;
  thumbnail?: string;
  uploaded?: number;
  uploaderName?: string;
}

async function fetchViaYoutubeApi(channelId: string, apiKey: string): Promise<VideoItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", "4");
  url.searchParams.set("type", "video");

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 * 20 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`YouTube API ${response.status}`);
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

async function fetchViaPiped(channelId: string): Promise<VideoItem[]> {
  for (const base of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${base}/channel/${channelId}`, {
        next: { revalidate: 60 * 20 },
        headers: { "user-agent": "valorant-dashboard/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const data = await response.json() as { relatedStreams?: PipedVideo[] };
      const videos = (data.relatedStreams ?? []).slice(0, 4).map((v) => {
        const videoId = v.url?.replace("/watch?v=", "") ?? "";
        return {
          id: videoId,
          title: v.title ?? "",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: v.thumbnail ?? "",
          publishedAt: v.uploaded ? new Date(v.uploaded).toISOString() : "",
        };
      });
      if (videos.length > 0) return videos;
    } catch {
      // try next instance
    }
  }
  throw new Error("Piped API 실패");
}

export async function GET(req: NextRequest) {
  const channel: Channel = req.nextUrl.searchParams.get("channel") === "global" ? "global" : "kr";
  const channelId = CHANNELS[channel];
  const apiKey = process.env.YOUTUBE_API_KEY;

  // 1. YouTube Data API v3 (API 키 있을 때 우선)
  if (apiKey) {
    try {
      const videos = await fetchViaYoutubeApi(channelId, apiKey);
      return NextResponse.json({ videos });
    } catch (e) {
      console.error(`[youtube/latest] YouTube API 실패 (${channel}):`, e);
    }
  }

  // 2. Piped API (무료, 키 불필요)
  try {
    const videos = await fetchViaPiped(channelId);
    return NextResponse.json({ videos });
  } catch (e) {
    console.error(`[youtube/latest] Piped API 실패 (${channel}):`, e);
  }

  return NextResponse.json({ videos: [] });
}
