import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  const gameName = req.nextUrl.searchParams.get("gameName") ?? "hide on bush";
  const tagLine = req.nextUrl.searchParams.get("tagLine") ?? "KR1";

  const encoded = `${encodeURIComponent(gameName)}%23${encodeURIComponent(tagLine)}`;
  const url = `https://api.tracker.gg/api/v2/valorant/standard/matches/riot/${encoded}?type=competitive&season=all&count=3`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://tracker.gg/valorant/profile/riot/",
    "Origin": "https://tracker.gg",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };

  try {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10000);
    const res = await fetch(url, { headers, cache: "no-store", signal: ac.signal });
    const status = res.status;
    const text = await res.text();

    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }

    // 파싱된 경우 첫 번째 매치의 첫 번째 player 세그먼트만 반환 (크기 줄이기)
    const data = parsed as Record<string, unknown> | null;
    const firstMatch = Array.isArray(data?.data) ? (data!.data as unknown[])[0] : null;
    const fm = firstMatch as Record<string, unknown> | null;
    const segments = Array.isArray(fm?.segments) ? fm!.segments as unknown[] : [];
    const firstPlayerSeg = segments.find((s: unknown) => (s as Record<string, unknown>).type === "player");

    return Response.json({
      url,
      status,
      cfBlocked: status === 403 || status === 429 || text.includes("Cloudflare"),
      matchCount: Array.isArray(data?.data) ? (data!.data as unknown[]).length : 0,
      firstMatchMetadata: fm?.metadata ?? null,
      firstMatchAttributes: fm?.attributes ?? null,
      firstPlayerSegment: firstPlayerSeg ?? null,
      rawSnippet: text.slice(0, 500),
    });
  } catch (e) {
    return Response.json({ error: String(e), url });
  }
}
