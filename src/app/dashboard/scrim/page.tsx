"use client";

import { useEffect, useMemo, useState } from "react";

interface ScrimPlayer {
  id: string;
  team: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    riotGameName?: string | null;
  };
}

interface ScrimSession {
  id: string;
  title: string;
  status: string;
  map: string | null;
  winnerId: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  players: ScrimPlayer[];
}

interface KdRankingPlayer {
  userId: string;
  name: string | null;
  image: string | null;
  kills: number;
  deaths: number;
  assists: number;
  matches: number;
  kd: number;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function getWinnerLabel(winnerId: string | null) {
  if (winnerId === "team_a") return "Team A 승리";
  if (winnerId === "team_b") return "Team B 승리";
  if (winnerId === "draw") return "무승부";
  return "결과 미등록";
}

export default function ScrimPage() {
  const [scrims, setScrims] = useState<ScrimSession[]>([]);
  const [kdRanking, setKdRanking] = useState<KdRankingPlayer[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/scrim").then((response) => response.json()),
      fetch("/api/me/roles").then((response) => response.json()).catch(() => ({ isAdmin: false })),
    ])
      .then(([scrimData, roleData]) => {
        setScrims(scrimData.sessions ?? []);
        setKdRanking(scrimData.kdRanking ?? []);
        setIsAdmin(Boolean(roleData.isAdmin));
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleScrims = useMemo(() => scrims, [scrims]);

  async function deleteScrim(id: string) {
    if (!isAdmin || deletingId) return;
    const confirmed = window.confirm("이 내전 기록을 삭제할까요?");
    if (!confirmed) return;

    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/scrim?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "내전 기록 삭제에 실패했습니다.");

      setScrims((current) => current.filter((scrim) => scrim.id !== id));
      setMessage("내전 기록을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내전 기록 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function showCreateNotice() {
    setMessage("웹 내전 생성은 준비 중입니다. 지금은 Discord /내전 시작 명령어를 사용해 주세요.");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
            VALORANT DASHBOARD
          </div>
          <h1 className="text-2xl font-black text-white">내전</h1>
          <p className="mt-0.5 text-sm text-[#7b8a96]">
            생성된 내전 기록과 내전 KD 랭킹을 확인합니다.
          </p>
        </div>
        <button type="button" onClick={showCreateNotice} className="val-btn bg-[#ff4655] px-4 py-2 text-xs font-black text-white">
          내전 생성
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#7b8a96]">생성된 내전 목록</h2>
              <span className="text-xs text-[#7b8a96]">{visibleScrims.length}개</span>
            </div>

            {visibleScrims.length === 0 ? (
              <div className="val-card p-12 text-center text-[#7b8a96]">아직 내전 기록이 없습니다.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleScrims.map((scrim) => {
                  const teamA = scrim.players?.filter((player) => player.team === "team_a") ?? [];
                  const teamB = scrim.players?.filter((player) => player.team === "team_b") ?? [];

                  return (
                    <article key={scrim.id} className="val-card p-5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-black text-white">{scrim.title}</h3>
                            {scrim.map && (
                              <span className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-2 py-0.5 text-[11px] font-bold text-[#9aa8b3]">
                                {scrim.map}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[#7b8a96]">{formatDate(scrim.createdAt)}</div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="rounded bg-[#ff4655]/10 px-3 py-1 text-xs font-black text-[#ff4655]">
                            {getWinnerLabel(scrim.winnerId)}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => deleteScrim(scrim.id)}
                              disabled={deletingId === scrim.id}
                              className="rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-1 text-xs font-black text-[#ff8a95] transition-colors hover:border-[#ff4655] hover:text-white disabled:opacity-50"
                            >
                              {deletingId === scrim.id ? "삭제 중" : "삭제"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <TeamPanel label="Team A" color="text-[#0fffd0]" players={teamA} />
                        <TeamPanel label="Team B" color="text-[#ff8a95]" players={teamB} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="val-card h-fit p-5">
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">SCRIM KD BOARD</div>
              <h2 className="mt-1 text-xl font-black text-white">내전 KD 랭킹</h2>
              <p className="mt-1 text-xs text-[#7b8a96]">기록된 내전 매치의 킬/데스 기준입니다.</p>
            </div>

            {kdRanking.length === 0 ? (
              <div className="rounded border border-dashed border-[#2a3540] bg-[#0f1923]/45 px-3 py-8 text-center text-xs text-[#7b8a96]">
                아직 KD 기록이 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {kdRanking.map((player, index) => (
                  <div key={player.userId} className="flex items-center gap-3 rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2">
                    <span className="w-6 text-center text-sm font-black text-[#ff4655]">{index + 1}</span>
                    {player.image ? (
                      <img src={player.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-[#24313c]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">{player.name ?? "이름 없음"}</div>
                      <div className="text-[11px] text-[#7b8a96]">
                        {player.kills}K / {player.deaths}D / {player.assists}A · {player.matches}경기
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{player.kd.toFixed(2)}</div>
                      <div className="text-[10px] text-[#7b8a96]">KD</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function TeamPanel({ label, color, players }: { label: string; color: string; players: ScrimPlayer[] }) {
  return (
    <div className="rounded border border-[#2a3540] bg-[#111c24] p-3">
      <div className={`mb-2 text-xs font-black ${color}`}>{label}</div>
      {players.length === 0 ? (
        <div className="text-xs text-[#7b8a96]">등록된 플레이어 없음</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-2 rounded bg-[#0b141c]/70 px-2 py-1.5">
              {player.user?.image ? (
                <img src={player.user.image} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-[#24313c]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{player.user?.name ?? "이름 없음"}</div>
              </div>
              {(player.kills !== null || player.deaths !== null || player.assists !== null) && (
                <span className="text-xs font-bold text-[#9aa8b3]">
                  {player.kills ?? 0}/{player.deaths ?? 0}/{player.assists ?? 0}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
