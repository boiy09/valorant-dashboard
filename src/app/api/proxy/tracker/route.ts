import { NextRequest, NextResponse } from 'next/server';

// tracker.gg 내부 API를 브라우저처럼 위장해서 스크래핑
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'Origin': 'https://tracker.gg',
  'Referer': 'https://tracker.gg/valorant',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get('name') ?? searchParams.get('gameName');
  const tag = searchParams.get('tag') ?? searchParams.get('tagLine');

  if (!name || !tag) {
    return NextResponse.json({ error: 'name, tag 파라미터가 필요합니다.' }, { status: 400 });
  }

  const encoded = `${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const profileUrl = `https://api.tracker.gg/api/v2/valorant/standard/profile/riot/${encoded}`;
  const agentUrl = `https://api.tracker.gg/api/v2/valorant/standard/profile/riot/${encoded}/segments/agent`;
  const referer = `https://tracker.gg/valorant/profile/riot/${encoded}/overview`;

  try {
    const [profileRes, agentRes] = await Promise.all([
      fetch(profileUrl, { headers: { ...BROWSER_HEADERS, Referer: referer } }),
      fetch(agentUrl,   { headers: { ...BROWSER_HEADERS, Referer: referer } }),
    ]);

    if (profileRes.status === 404) {
      return NextResponse.json({ error: '플레이어를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!profileRes.ok) {
      const text = await profileRes.text().catch(() => '');
      console.error('[scrape] tracker.gg 응답 실패:', profileRes.status, text.slice(0, 200));
      return NextResponse.json(
        { error: `tracker.gg 차단됨 (${profileRes.status})`, blocked: true },
        { status: 503 }
      );
    }

    const profileJson = await profileRes.json();
    const segments: any[] = profileJson?.data?.segments ?? [];

    const overviewSeg = segments.find((s: any) => s.type === 'overview');
    const ov = overviewSeg?.stats ?? {};

    function val(stat: any): number {
      return typeof stat?.value === 'number' ? stat.value : 0;
    }
    function meta(stat: any, field: string): string {
      return typeof stat?.metadata?.[field] === 'string' ? stat.metadata[field] : '';
    }

    const matchesPlayed = Math.round(val(ov.matchesPlayed));
    const wins = Math.round(val(ov.wins));

    const stats = {
      matchesPlayed,
      winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
      kd: Math.round(val(ov.kRatio) * 100) / 100,
      headshotPct: Math.round(val(ov.headshotsPercentage) * 10) / 10,
      killsPerRound: Math.round(val(ov.killsPerRound) * 100) / 100,
      scorePerRound: Math.round(val(ov.scorePerRound)),
      damagePerRound: Math.round(val(ov.damagePerRound)),
    };

    const seasons = segments
      .filter((s: any) => s.type === 'season')
      .map((s: any) => {
        const st = s.stats ?? {};
        const mp = Math.round(val(st.matchesPlayed));
        const w = Math.round(val(st.wins));
        const seasonKey: string = s.attributes?.season ?? '';
        const m = seasonKey.match(/^e(\d+)a(\d+)$/i);
        return {
          season: seasonKey,
          label: m ? `에피소드 ${m[1]} 액트 ${m[2]}` : seasonKey,
          rankName: meta(st.rank, 'tierName') || null,
          tier: Math.round(val(st.rank)),
          matchesPlayed: mp,
          wins: w,
          winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
        };
      })
      .filter((s: any) => s.matchesPlayed > 0)
      .sort((a: any, b: any) => b.season.localeCompare(a.season));

    let agents: any[] = [];
    if (agentRes.ok) {
      const agentJson = await agentRes.json();
      agents = (agentJson?.data ?? [])
        .map((s: any) => {
          const st = s.stats ?? {};
          const mt = s.metadata ?? {};
          const mp = Math.round(val(st.matchesPlayed));
          const w = Math.round(val(st.wins));
          return {
            name: mt.name ?? 'Unknown',
            imageUrl: mt.imageUrl ?? '',
            matchesPlayed: mp,
            winRate: mp > 0 ? Math.round((w / mp) * 100) : 0,
            kd: Math.round(val(st.kRatio) * 100) / 100,
            damagePerRound: Math.round(val(st.damagePerRound)),
          };
        })
        .filter((a: any) => a.matchesPlayed > 0)
        .sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed);
    }

    return NextResponse.json(
      { gameName: name, tagLine: tag, stats, agents, seasons, source: 'scrape' },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    );
  } catch (err: any) {
    console.error('[scrape] 오류:', err?.message);
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 });
  }
}
