import { auth } from "@/lib/auth";
import { getVctSchedule } from "@/lib/valorant";

const LEAGUES = [
  { id: "vct_pacific", name: "VCT Pacific" },
  { id: "vct_americas", name: "VCT Americas" },
  { id: "vct_emea", name: "VCT EMEA" },
  { id: "vct_cn", name: "VCT China" },
  { id: "valorant_champions", name: "Valorant Champions" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const results = await Promise.allSettled(
    LEAGUES.map(async (league) => {
      const matches = await getVctSchedule(league.id, 5);
      return { league: league.name, leagueId: league.id, matches };
    })
  );

  const leagues = results.flatMap((r) => {
    if (r.status === "fulfilled" && r.value.matches.length > 0) return [r.value];
    return [];
  });

  const allMatches = leagues
    .flatMap((l) => l.matches.map((m) => ({ ...m, leagueName: l.league })))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return Response.json({ matches: allMatches });
}
