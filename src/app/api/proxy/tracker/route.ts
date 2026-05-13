import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get('name');
  const tag = searchParams.get('tag');

  if (!name || !tag) {
    return NextResponse.json(
      { success: false, error: 'Missing name or tag parameter' },
      { status: 400 }
    );
  }

  try {
    // Tracker.gg API 호출 (공개 API)
    const trackerUrl = `https://api.tracker.gg/api/v2/valorant/standard/profile/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
    
    const response = await fetch(trackerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const data = await response.json();
    
    // 필요한 데이터만 추출
    const stats = {
      success: true,
      name: data.data?.metadata?.name || name,
      tag: data.data?.metadata?.tag || tag,
      tier: data.data?.segments?.[0]?.stats?.tier?.metadata?.tierName || 'Unknown',
      rr: data.data?.segments?.[0]?.stats?.ranking?.displayRanking || 0,
      kd: data.data?.segments?.[0]?.stats?.kd?.displayValue || '0.00',
      winRate: data.data?.segments?.[0]?.stats?.winRate?.displayValue || '0%',
      matches: data.data?.segments?.[0]?.stats?.matches?.displayValue || 0,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Tracker.gg API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
