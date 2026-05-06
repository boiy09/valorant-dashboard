import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인 필요" }, { status: 401 });

  const gameName = req.nextUrl.searchParams.get("gameName") ?? "수박";
  const tagLine = req.nextUrl.searchParams.get("tagLine") ?? "KOR";
  const region = req.nextUrl.searchParams.get("region") ?? "kr";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };

  const enc = encodeURIComponent;
  // 여러 URL 형식 시도
  const candidates = [
    `https://op.gg/valorant/profile/${region}/${enc(gameName)}-${enc(tagLine)}`,
    `https://www.op.gg/valorant/profile/${region}/${enc(gameName)}-${enc(tagLine)}`,
    `https://c-valorant-web-v2.op.gg/profile/${region}/${enc(gameName)}-${enc(tagLine)}`,
    `https://valorant.op.gg/profile/${region}/${enc(gameName)}-${enc(tagLine)}`,
    `https://op.gg/valorant/profile/${region}/${enc(gameName)}%23${enc(tagLine)}`,
  ];
  // 먼저 어떤 URL이 200을 반환하는지 빠르게 체크
  const checks = await Promise.all(candidates.map(async url => {
    try {
      const ac = new AbortController(); setTimeout(() => ac.abort(), 5000);
      const r = await fetch(url, { headers, cache: "no-store", signal: ac.signal });
      return { url, status: r.status };
    } catch { return { url, status: 0 }; }
  }));

  const working = checks.find(c => c.status === 200);
  const pageUrl = working?.url ?? candidates[0];

  try {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10000);
    const res = await fetch(pageUrl, { headers, cache: "no-store", signal: ac.signal });
    const html = await res.text();

    // __NEXT_DATA__ 추출
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      return Response.json({
        urlChecks: checks,
        usedUrl: pageUrl,
        status: res.status,
        hasNextData: false,
        snippet: html.slice(0, 500),
      });
    }

    const nextData = JSON.parse(match[1]) as Record<string, unknown>;
    const props = nextData.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;

    // 매치 관련 키 찾기
    const keys = pageProps ? Object.keys(pageProps) : [];
    const matchKey = keys.find(k => k.toLowerCase().includes("match"));
    const matchData = matchKey ? pageProps![matchKey] : null;
    const firstMatch = Array.isArray(matchData) ? matchData[0] : matchData;

    return Response.json({
      status: res.status,
      hasNextData: true,
      pagePropsKeys: keys,
      matchKey,
      firstMatch,
      // 전체 데이터는 너무 크므로 첫 match만
    });
  } catch (e) {
    return Response.json({ error: String(e), pageUrl });
  }
}
