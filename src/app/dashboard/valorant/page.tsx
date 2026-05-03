import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, getRecentMatches, MatchStats } from "@/lib/valorant";
import TrackerStats from "../TrackerStats";

export const dynamic = "force-dynamic";

type RiotRegion = "KR" | "AP";

interface RegionStats {
  region: RiotRegion;
  riotId: string;
  puuid: string;
  rank: Awaited<ReturnType<typeof getRankByPuuid>>;
  recentMatches: MatchStats[];
}

const REGION_LABELS: Record<RiotRegion, string> = {
  KR: "한섭",
  AP: "아섭",
};

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      riotAccounts: {
        orderBy: [{ region: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      include: {
        riotAccounts: {
          orderBy: [{ region: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  }

  return user;
}

function buildSummary(matches: MatchStats[]) {
  const wins = matches.filter((match) => match.result === "승리").length;
  const losses = matches.filter((match) => match.result === "패배").length;
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null;
  const avgKills =
    matches.length > 0
      ? (matches.reduce((sum, match) => sum + match.kills, 0) / matches.length).toFixed(1)
      : null;
  const avgHs =
    matches.length > 0
      ? Math.round(
          matches.reduce((sum, match) => {
            const total = match.headshots + match.bodyshots + match.legshots;
            return sum + (total > 0 ? (match.headshots / total) * 100 : 0);
          }, 0) / matches.length
        )
      : null;

  return { wins, losses, winRate, avgKills, avgHs };
}

function EmptyRegionCard({ region }: { region: RiotRegion }) {
  return (
    <div className="val-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase">
          {region} · {REGION_LABELS[region]}
        </div>
        <span className="text-[#7b8a96] text-xs">미연동</span>
      </div>
      <div className="text-white font-bold mb-1">연결된 라이엇 계정이 없습니다</div>
      <div className="text-[#7b8a96] text-sm">
        상단의 <span className="text-[#ff4655]">라이엇 연동</span> 메뉴에서 {REGION_LABELS[region]} 계정을 연결해주세요.
      </div>
    </div>
  );
}

function RegionMatchList({ matches }: { matches: MatchStats[] }) {
  if (matches.length === 0) {
    return (
      <div className="val-card p-4 text-[#7b8a96] text-sm">
        최근 매치 데이터가 아직 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match, index) => {
        const total = match.headshots + match.bodyshots + match.legshots;
        const hs = total > 0 ? Math.round((match.headshots / total) * 100) : 0;
        const kd =
          match.deaths > 0 ? (match.kills / match.deaths).toFixed(2) : match.kills.toFixed(2);

        return (
          <div
            key={`${match.matchId}-${index}`}
            className="val-card px-5 py-3 flex items-center gap-4"
            style={{
              borderLeftWidth: 3,
              borderLeftStyle: "solid",
              borderLeftColor:
                match.result === "승리"
                  ? "#4ade80"
                  : match.result === "패배"
                    ? "#ff4655"
                    : "#52525b",
            }}
          >
            {match.agentIcon ? (
              <img
                src={match.agentIcon}
                alt={match.agent}
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-[#111c24] flex-shrink-0" />
            )}
            <div className="flex-shrink-0 w-14">
              <div
                className={`font-black text-sm ${
                  match.result === "승리"
                    ? "text-green-400"
                    : match.result === "패배"
                      ? "text-[#ff4655]"
                      : "text-zinc-400"
                }`}
              >
                {match.result}
              </div>
              <div className="text-[#7b8a96] text-xs">{match.agent}</div>
            </div>
            <div className="hidden sm:block text-[#7b8a96] text-sm w-16 flex-shrink-0">
              {match.map}
            </div>
            <div className="flex-1">
              <span className="text-white font-bold">{match.kills}</span>
              <span className="text-[#7b8a96] text-sm"> / </span>
              <span className="text-[#ff4655] font-bold">{match.deaths}</span>
              <span className="text-[#7b8a96] text-sm"> / </span>
              <span className="text-white font-bold">{match.assists}</span>
              <span className="text-[#7b8a96] text-xs ml-2">KD {kd}</span>
            </div>
            <div className="hidden md:flex items-center gap-1 flex-shrink-0">
              <span className="text-white text-sm">{hs}%</span>
              <span className="text-[#7b8a96] text-xs">HS</span>
            </div>
            <div className="text-[#7b8a96] text-xs text-right flex-shrink-0">
              {match.playedAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RegionSection({ data }: { data: RegionStats }) {
  const summary = buildSummary(data.recentMatches);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
            {data.region} · {REGION_LABELS[data.region]}
          </div>
          <h2 className="text-xl font-black text-white">{data.riotId}</h2>
        </div>
        <div className="text-[#7b8a96] text-xs">최근 10경기 기준</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="val-card p-5 col-span-2">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">현재 랭크</div>
          {data.rank ? (
            <div className="flex items-center gap-4">
              {data.rank.rankIcon ? (
                <img src={data.rank.rankIcon} alt={data.rank.tierName} className="w-16 h-16 drop-shadow-lg" />
              ) : (
                <div className="w-16 h-16 rounded bg-[#111c24] border border-[#2a3540]" />
              )}
              <div>
                <div className="text-xl font-black text-white">{data.rank.tierName}</div>
                <div className="text-[#ff4655] font-bold text-lg">{data.rank.rr} RR</div>
                <div className="text-[#7b8a96] text-xs mt-1">
                  {data.rank.wins}승 / {Math.max(data.rank.games - data.rank.wins, 0)}패
                </div>
                {data.rank.peakRankIcon && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <img src={data.rank.peakRankIcon} alt="peak" className="w-4 h-4" />
                    <span className="text-[#7b8a96] text-xs">최고: {data.rank.peakTierName}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[#7b8a96]">랭크 정보가 아직 없습니다.</div>
          )}
        </div>

        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">
            최근 {data.recentMatches.length}경기 승률
          </div>
          <div
            className={`text-3xl font-black mb-2 ${
              summary.winRate !== null
                ? summary.winRate >= 50
                  ? "text-green-400"
                  : "text-[#ff4655]"
                : "text-white"
            }`}
          >
            {summary.winRate !== null ? `${summary.winRate}%` : "--"}
          </div>
          {data.recentMatches.length > 0 && (
            <div className="flex gap-0.5">
              {data.recentMatches.map((match, index) => (
                <div
                  key={`${match.matchId}-bar-${index}`}
                  className={`h-1 flex-1 rounded-sm ${
                    match.result === "승리"
                      ? "bg-green-400"
                      : match.result === "패배"
                        ? "bg-[#ff4655]"
                        : "bg-zinc-600"
                  }`}
                />
              ))}
            </div>
          )}
          <div className="text-[#7b8a96] text-xs mt-1.5">
            {summary.wins}승 {summary.losses}패
          </div>
        </div>

        <div className="val-card p-5">
          <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-2">평균 킬</div>
          <div className="text-3xl font-black text-white mb-1">{summary.avgKills ?? "--"}</div>
          <div className="text-[#7b8a96] text-xs">최근 경기 기준</div>
          {summary.avgHs !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[#ff4655] font-bold text-sm">{summary.avgHs}%</span>
              <span className="text-[#7b8a96] text-xs">헤드샷률</span>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3">최근 매치</div>
        <RegionMatchList matches={data.recentMatches} />
      </div>

      <div>
        <div className="text-[#7b8a96] text-xs tracking-widest uppercase mb-3 flex items-center gap-2">
          <span>심화 전적 통계</span>
          <span className="text-[#ff4655] text-[10px] bg-[#ff4655]/10 px-1.5 py-0.5 rounded">
            최근 20경기
          </span>
        </div>
        <TrackerStats
          key={`${data.region}-${data.riotId}`}
          gameName={data.riotId.split("#")[0]}
          tagLine={data.riotId.split("#")[1]}
        />
      </div>
    </section>
  );
}

export default async function ValorantPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const user = await findUser(session.user.id!, session.user.email);
  const accounts = user?.riotAccounts ?? [];

  const accountStats = await Promise.all(
    accounts.map(async (account) => {
      const [rank, recentMatches] = await Promise.all([
        getRankByPuuid(account.puuid).catch(() => null),
        getRecentMatches(account.puuid, 10).catch(() => []),
      ]);

      return {
        region: account.region as RiotRegion,
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid,
        rank,
        recentMatches,
      } satisfies RegionStats;
    })
  );

  const sortedStats = accountStats.sort(
    (a, b) => REGIONS_ORDER.indexOf(a.region) - REGIONS_ORDER.indexOf(b.region)
  );

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">전적</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          한섭(KR)과 아섭(AP) 계정을 각각 연결해서 전적을 확인할 수 있습니다.
        </p>
      </div>

      {sortedStats.length === 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <EmptyRegionCard region="KR" />
          <EmptyRegionCard region="AP" />
        </div>
      )}

      {sortedStats.length > 0 && (
        <>
          {(["KR", "AP"] as RiotRegion[]).map((region) => {
            const section = sortedStats.find((item) => item.region === region);
            return section ? (
              <RegionSection key={region} data={section} />
            ) : (
              <div key={region} className="mb-8">
                <EmptyRegionCard region={region} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const REGIONS_ORDER: RiotRegion[] = ["KR", "AP"];
