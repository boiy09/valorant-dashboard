"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface KdRankingPlayer {
  userId: string;
  name: string | null;
  image: string | null;
  kills: number;
  deaths: number;
  assists: number;
  matches: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  kd: number;
  krTier: string;
  krTierIcon: string;
  apTier: string;
  apTierIcon: string;
  rank: number;
}

type SortKey = "gamesPlayed" | "kills" | "deaths" | "winRate" | "kd";

const COLUMNS: { key: SortKey; label: string; width: string; defaultDesc: boolean }[] = [
  { key: "gamesPlayed", label: "판수",   width: "w-14", defaultDesc: true },
  { key: "kills",       label: "킬",     width: "w-14", defaultDesc: true },
  { key: "deaths",      label: "데스",   width: "w-14", defaultDesc: false },
  { key: "winRate",     label: "승률",   width: "w-16", defaultDesc: true },
  { key: "kd",          label: "KD",    width: "w-16", defaultDesc: true },
];

export default function ScrimRankingPage() {
  const [kdRanking, setKdRanking] = useState<KdRankingPlayer[]>([]);
  const [myRank, setMyRank] = useState<KdRankingPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("kd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    const query = selectedTier ? `?tier=${selectedTier}` : "";
    fetch(`/api/scrim/ranking${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setKdRanking(d.ranking); setMyRank(d.myRank); })
      .finally(() => setLoading(false));
  }, [selectedTier]);

  const sorted = useMemo(() => {
    const mult = sortDir === "desc" ? -1 : 1;
    return [...kdRanking].sort((a, b) => mult * (a[sortKey] - b[sortKey]));
  }, [kdRanking, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.defaultDesc ? "desc" : "asc");
    }
  }

  const tiers = [
    "아이언", "브론즈", "실버", "골드", "플래티넘",
    "다이아몬드", "초월자", "불멸", "레디언트", "언랭크",
  ];

  return (
    <div className="h-[calc(100vh-80px)] bg-[#0b141c] flex flex-col overflow-hidden px-4 sm:px-6">
      {/* 헤더 */}
      <div className="flex-none py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.3em] text-[#ff4655]">
              Valorant Dashboard
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">KD RANKING BOARD</h1>
          </div>
          <Link
            href="/dashboard/scrim"
            className="val-btn border border-[#2a3540] bg-[#0f1923] px-5 py-2.5 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white transition-all"
          >
            내전 목록으로 돌아가기
          </Link>
        </div>

        {/* 내 순위 */}
        <div className="mx-auto max-w-5xl mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-1 bg-[#ff4655]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">MY STANDING</h2>
          </div>
          {loading ? (
            <div className="val-card p-6 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
            </div>
          ) : myRank ? (
            <RankingRow player={myRank} isMe />
          ) : (
            <div className="val-card border-dashed border-[#2a3540] bg-[#0f1923]/30 p-6 text-center">
              <p className="text-sm font-bold text-[#7b8a96]">아직 내전 참여 기록이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 리더보드 */}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-5xl flex flex-col mb-8">
        {/* 필터 */}
        <div className="flex-none mb-4 flex items-center justify-between gap-4 rounded-lg bg-[#0f1923] p-4 border border-[#2a3540]">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 bg-[#ff4655]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">리더보드</h2>
            {!loading && (
              <span className="text-xs text-[#7b8a96]">{sorted.length}명</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-[#7b8a96] uppercase">Filter Tier:</span>
            <select
              value={selectedTier ?? "all"}
              onChange={(e) => setSelectedTier(e.target.value === "all" ? null : e.target.value)}
              className="rounded border border-[#2a3540] bg-[#0b141c] px-4 py-1.5 text-xs font-black text-white outline-none focus:border-[#ff4655] cursor-pointer"
            >
              <option value="all">모든 티어</option>
              {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* 컬럼 헤더 */}
        <div className="flex-none mb-2 flex items-center gap-3 px-4 text-[10px] font-black uppercase tracking-widest text-[#7b8a96]">
          <div className="w-8 text-center shrink-0">#</div>
          <div className="flex-1 min-w-0">Player</div>
          <div className="hidden sm:flex items-center gap-3">
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`${col.width} flex items-center justify-end gap-1 transition-colors hover:text-white ${
                  sortKey === col.key ? "text-[#ff4655]" : ""
                }`}
              >
                <span>{col.label}</span>
                <span className="text-[9px]">
                  {sortKey === col.key ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
                </span>
              </button>
            ))}
          </div>
          {/* 모바일: KD만 표시 */}
          <button
            onClick={() => handleSort("kd")}
            className={`sm:hidden flex items-center gap-1 ${sortKey === "kd" ? "text-[#ff4655]" : ""}`}
          >
            KD <span className="text-[9px]">{sortKey === "kd" ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}</span>
          </button>
        </div>

        {/* 스크롤 리스트 */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="val-card p-20 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#ff4655] border-t-transparent" />
              <p className="text-sm font-bold text-[#7b8a96]">데이터를 불러오는 중입니다...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="val-card p-20 text-center border-dashed border-[#2a3540]">
              <p className="text-sm font-bold text-[#7b8a96]">등록된 랭킹 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-4">
              {sorted.map((player, index) => (
                <RankingRow
                  key={player.userId}
                  player={player}
                  index={index}
                  isMe={myRank?.userId === player.userId}
                  sortKey={sortKey}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0b141c; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a3540; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ff4655; }
      `}</style>
    </div>
  );
}

// ─── 랭킹 행 ──────────────────────────────────────────────────────────────────
function RankingRow({
  player,
  index,
  isMe,
  sortKey,
}: {
  player: KdRankingPlayer;
  index?: number;
  isMe?: boolean;
  sortKey?: SortKey;
}) {
  const isTop3 = index !== undefined && index < 3;
  const rankClass = isTop3
    ? index === 0
      ? "border-2 border-yellow-500/50 bg-yellow-500/10 shadow-lg shadow-yellow-500/10"
      : index === 1
      ? "border-2 border-gray-400/50 bg-gray-400/10 shadow-lg shadow-gray-400/10"
      : "border-2 border-amber-700/50 bg-amber-700/10 shadow-lg shadow-amber-700/10"
    : isMe
    ? "border border-[#ff4655] bg-[#ff4655]/10"
    : "border border-[#2a3540] bg-[#0f1923]/70";

  function StatCell({
    colKey,
    value,
    format,
    highlight,
  }: {
    colKey: SortKey;
    value: number;
    format?: (v: number) => string;
    highlight?: boolean;
  }) {
    const active = sortKey === colKey;
    const displayVal = format ? format(value) : String(value);
    return (
      <div
        className={`text-right text-sm font-black transition-colors ${
          highlight ? "text-[#ff4655]" : active ? "text-white" : "text-[#c8d3db]"
        }`}
      >
        {displayVal}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded px-4 py-3 transition-all text-white ${rankClass}`}>
      {/* 순위 */}
      <div className="w-8 shrink-0 text-center text-sm font-black text-[#7b8a96]">
        {isTop3 && index !== undefined ? (
          <span className={index === 0 ? "text-yellow-400" : index === 1 ? "text-gray-300" : "text-amber-600"}>
            {index === 0 ? "①" : index === 1 ? "②" : "③"}
          </span>
        ) : (
          player.rank
        )}
      </div>

      {/* 플레이어 정보 */}
      <div className="flex flex-1 items-center gap-3 min-w-0">
        {player.image ? (
          <img src={player.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#2a3540]" />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#24313c] ring-1 ring-[#2a3540]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-white">{player.name ?? "이름 없음"}</span>
            {isMe && (
              <span className="shrink-0 rounded bg-[#ff4655] px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                MY
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-[#7b8a96] uppercase">KR</span>
              <img src={player.krTierIcon} alt={player.krTier} className="h-4 w-4" />
              <span className="text-[11px] text-[#c8d3db]">{player.krTier}</span>
            </div>
            <div className="flex items-center gap-1 border-l border-[#2a3540] pl-2">
              <span className="text-[10px] font-bold text-[#7b8a96] uppercase">AP</span>
              <img src={player.apTierIcon} alt={player.apTier} className="h-4 w-4" />
              <span className="text-[11px] text-[#c8d3db]">{player.apTier}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 스탯 (데스크탑) */}
      <div className="hidden sm:flex items-center gap-3">
        {/* 판수 */}
        <div className="w-14 text-right">
          <StatCell colKey="gamesPlayed" value={player.gamesPlayed} />
          <div className="text-[9px] text-[#7b8a96] uppercase">판수</div>
        </div>
        {/* 킬 */}
        <div className="w-14 text-right">
          <StatCell colKey="kills" value={player.kills} />
          <div className="text-[9px] text-[#7b8a96] uppercase">킬</div>
        </div>
        {/* 데스 */}
        <div className="w-14 text-right">
          <StatCell colKey="deaths" value={player.deaths} />
          <div className="text-[9px] text-[#7b8a96] uppercase">데스</div>
        </div>
        {/* 승률 */}
        <div className="w-16 text-right">
          <StatCell
            colKey="winRate"
            value={player.winRate}
            format={(v) => `${v}%`}
            highlight={player.winRate >= 60}
          />
          <div className="text-[9px] text-[#7b8a96] uppercase">승률</div>
        </div>
        {/* KD */}
        <div className="w-16 text-right">
          <StatCell
            colKey="kd"
            value={player.kd}
            format={(v) => v.toFixed(2)}
            highlight
          />
          <div className="text-[9px] font-bold text-[#7b8a96] uppercase">KD</div>
        </div>
      </div>

      {/* 모바일: KD만 */}
      <div className="sm:hidden text-right">
        <div className="text-base font-black text-[#ff4655]">{player.kd.toFixed(2)}</div>
        <div className="text-[10px] font-bold text-[#7b8a96] uppercase">KD</div>
      </div>
    </div>
  );
}
