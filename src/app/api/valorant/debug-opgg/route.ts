import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// op.gg Valorant 내부 API 후보 엔드포인트 테스트
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  const gameName = req.nextUrl.searchParams.get("gameName") ?? "수박";
  const tagLine = req.nextUrl.searchParams.get("tagLine") ?? "KOR";
  const region = req.nextUrl.searchParams.get("region") ?? "kr";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.op.gg/valorant",
    "Origin": "https://www.op.gg",
  };

  async function tryUrl(url: string) {
    try {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 8000);
      const res = await fetch(url, { headers, cache: "no-store", signal: ac.signal });
      const text = await res.text();
      const isJson = text.trim().startsWith("{") || text.trim().startsWith("[");
      return {
        url,
        status: res.status,
        ok: res.ok,
        blocked: res.status === 403 || res.status === 429 || text.includes("Cloudflare") || text.includes("Been Blocked"),
        isJson,
        snippet: text.slice(0, 300),
      };
    } catch (e) {
      return { url, status: 0, ok: false, blocked: false, isJson: false, snippet: String(e) };
    }
  }

  const enc = encodeURIComponent;
  const slug = `${enc(gameName)}-${enc(tagLine)}`;
  const results = await Promise.all([
    // 프로필 조회
    tryUrl(`https://www.op.gg/valorant/api/v1/summoners/${region}?gameName=${enc(gameName)}&tagLine=${enc(tagLine)}`),
    tryUrl(`https://www.op.gg/valorant/api/v1/summoners/${region}/${slug}`),
    tryUrl(`https://www.op.gg/api/v1/valorant/summoners/${region}?gameName=${enc(gameName)}&tagLine=${enc(tagLine)}`),
    // 매치 목록
    tryUrl(`https://www.op.gg/valorant/api/v1/summoners/${region}/${slug}/matches`),
    tryUrl(`https://www.op.gg/api/v1/valorant/summoners/${region}/${slug}/matches?limit=5`),
    // Next.js 내부 API
    tryUrl(`https://op.gg/_next/data/valorant/profile/${region}/${slug}.json`),
    tryUrl(`https://www.op.gg/valorant/profile/${region}/${slug}/matches`),
  ]);

  return Response.json(results);
}
