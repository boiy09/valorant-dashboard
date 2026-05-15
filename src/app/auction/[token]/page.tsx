"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";

interface RiotAccount {
  gameName: string;
  tagLine: string;
  region: string;
  cachedTierName: string | null;
}

interface AuctionPlayer {
  id: string;
  team: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    valorantRole: string | null;
    favoriteAgents: string;
    riotAccounts: RiotAccount[];
  };
}

interface ScrimRoom {
  id: string;
  title: string;
  description: string | null;
  mode: string | null;
  players: AuctionPlayer[];
}

interface AuctionPick {
  id: string;
  sessionId: string;
  userId: string;
  captainId: string;
  team: string;
  amount: number;
  createdAt: string;
}

interface AuctionBid {
  id: string;
  sessionId: string;
  lotUserId: string;
  captainId: string;
  amount: number;
  createdAt: string;
}

interface AuctionState {
  phase: string;
  captainPoints: string;
  queue: string;
  currentUserId: string | null;
  currentBids: string;
  auctionStartAt: string | null;
  auctionDuration: number;
  failedQueue: string;
  bidLog?: string;
  auditLog?: string;
  picks?: AuctionPick[];
  bidHistory?: AuctionBid[];
}

interface RoomPayload {
  access: { role: "host" | "captain" | "observer"; captainId: string | null };
  scrim: ScrimRoom;
  auction: AuctionState | null;
}

const TEAM_COLORS = ["#ff4655", "#f6c945", "#00e7c2", "#7c9cff", "#b884ff", "#ff9f43"];

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function teamId(index: number) {
  return `team_${String.fromCharCode(97 + index)}`;
}

function playerName(player?: AuctionPlayer | null) {
  return player?.user.name ?? "이름 없음";
}

function teamName(index: number) {
  return `${String.fromCharCode(65 + index)}팀`;
}

function phaseLabel(phase?: string) {
  if (phase === "auction") return "경매 진행";
  if (phase === "reauction") return "재경매";
  if (phase === "paused") return "일시정지";
  if (phase === "done") return "경매 완료";
  return "준비 중";
}

function formatRole(role: RoomPayload["access"]["role"]) {
  if (role === "host") return "주최자";
  if (role === "captain") return "팀장";
  return "옵저버";
}

export default function AuctionAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const auctionForTimer = room?.auction;

  const loadRoom = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/scrim/auction/public/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "경매방을 불러오지 못했습니다.");
      setRoom(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "경매방을 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRoom();
    const interval = window.setInterval(() => void loadRoom(true), 3000);
    return () => window.clearInterval(interval);
  }, [loadRoom]);

  useEffect(() => {
    const auction = auctionForTimer;
    if (!auction?.auctionStartAt || (auction.phase !== "auction" && auction.phase !== "reauction")) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const elapsed = (Date.now() - new Date(auction.auctionStartAt!).getTime()) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(auction.auctionDuration - elapsed)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [auctionForTimer]);

  const derived = useMemo(() => {
    const players = room?.scrim.players ?? [];
    const playerMap = new Map(players.map((player) => [player.user.id, player]));
    const auction = room?.auction;
    const captainPoints = parseJson<Record<string, number>>(auction?.captainPoints, {});
    const currentBids = parseJson<Record<string, number>>(auction?.currentBids, {});
    const queue = parseJson<string[]>(auction?.queue, []);
    const failedQueue = parseJson<string[]>(auction?.failedQueue, []);
    const captainIds = Object.keys(captainPoints);
    const currentPlayer = auction?.currentUserId ? playerMap.get(auction.currentUserId) : null;
    const picks = auction?.picks ?? [];
    const bidHistory = auction?.bidHistory ?? [];
    const currentBidRows = Object.entries(currentBids)
      .map(([captainId, amount]) => ({ captainId, amount }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { players, playerMap, captainPoints, currentBids, queue, failedQueue, captainIds, currentPlayer, picks, bidHistory, currentBidRows };
  }, [room]);

  async function sendAction(action: string, extra: Record<string, unknown> = {}) {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/scrim/auction/public/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
      setRoom((current) => current ? { ...current, auction: data.auction } : current);
      setBidAmount("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#07111d] px-6 py-10 text-white">경매방을 불러오는 중...</div>;
  }

  if (!room?.scrim || !room.auction) {
    return (
      <div className="min-h-screen bg-[#07111d] px-6 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-lg border border-[#263442] bg-[#101925] p-6">
          <h1 className="text-2xl font-black">경매방을 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-[#9aa8b3]">{message ?? "경매가 아직 시작되지 않았거나 링크가 만료되었습니다."}</p>
        </div>
      </div>
    );
  }

  const { access, scrim, auction } = room;
  const { captainPoints, currentBids, queue, failedQueue, captainIds, currentPlayer, playerMap, picks, bidHistory, currentBidRows } = derived;
  const myCaptainId = access.captainId;
  const myPoints = myCaptainId ? captainPoints[myCaptainId] ?? 0 : 0;
  const myBid = myCaptainId ? currentBids[myCaptainId] ?? 0 : 0;
  const highestBid = currentBidRows[0]?.amount ?? 0;
  const highestCaptainId = currentBidRows[0]?.captainId ?? null;
  const canBid = access.role === "captain" && (auction.phase === "auction" || auction.phase === "reauction") && !!auction.currentUserId;
  const timerPct = auction.auctionDuration > 0 ? Math.max(0, Math.min(100, (timeLeft / auction.auctionDuration) * 100)) : 0;
  const timerColor = timerPct > 45 ? "#00e7c2" : timerPct > 20 ? "#f6c945" : "#ff4655";
  const currentLotBids = bidHistory.filter((bid) => bid.lotUserId === auction.currentUserId).slice(-8).reverse();

  return (
    <main className="min-h-screen bg-[#07111d] text-white">
      <div className="border-b border-[#263442] bg-[#0d1722]/95 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[#f6c945]">AUCTION ROOM</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{scrim.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-[#2f4052] bg-[#111f2e] px-3 py-2 text-xs font-black text-[#c8d3db]">{formatRole(access.role)}</span>
            <span className="rounded border border-[#f6c945]/45 bg-[#f6c945]/10 px-3 py-2 text-xs font-black text-[#ffe089]">{phaseLabel(auction.phase)}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {message && <div className="mb-4 rounded border border-[#314255] bg-[#162232] px-4 py-3 text-sm font-bold text-[#dce7ef]">{message}</div>}

        {auction.auctionDuration > 0 && (auction.phase === "auction" || auction.phase === "reauction") && (
          <div className="mb-5 overflow-hidden rounded-full bg-[#1d2732]" style={{ height: 10 }}>
            <div className="h-full rounded-full transition-all duration-200" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="space-y-3">
            {captainIds.map((captainId, index) => {
              const color = TEAM_COLORS[index % TEAM_COLORS.length];
              const captain = playerMap.get(captainId);
              const team = teamId(index);
              const teamPicks = picks.filter((pick) => pick.team === team);
              const pickedUserIds = new Set(teamPicks.map((pick) => pick.userId));
              const pickByUserId = new Map(teamPicks.map((pick) => [pick.userId, pick]));
              const members = scrim.players.filter((player) => player.user.id === captainId || player.team === team || pickedUserIds.has(player.user.id));

              return (
                <div key={captainId} className="rounded-lg border border-[#263442] bg-[#101925] p-4" style={{ borderTopColor: color, borderTopWidth: 4 }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black" style={{ color }}>{teamName(index)}</div>
                      <div className="mt-1 truncate text-sm font-black">{playerName(captain)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black">{(captainPoints[captainId] ?? 0).toLocaleString()}P</div>
                      {currentBids[captainId] > 0 && <div className="text-xs font-bold text-[#f6c945]">입찰 {currentBids[captainId].toLocaleString()}P</div>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {members.map((member) => {
                      const pick = pickByUserId.get(member.user.id);
                      return (
                        <div key={member.id} className="flex items-center gap-2 rounded bg-[#0a1320] px-2 py-1.5">
                          {member.user.image ? <img src={member.user.image} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-[#24313c]" />}
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#dce7ef]">{playerName(member)}</span>
                          {member.user.id === captainId && <span className="text-[10px] font-black text-[#f6c945]">C</span>}
                          {pick && <span className="text-[10px] font-black text-[#f6c945]">{pick.amount}P</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </aside>

          <section className="rounded-lg border border-[#263442] bg-[#101925] p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f6c945]">
                  {auction.phase === "reauction" ? "RE-AUCTION LOT" : "CURRENT LOT"}
                </div>
                <div className="mt-1 text-sm font-bold text-[#7b8a96]">대기 {queue.length}명 · 유찰 {failedQueue.length}명</div>
              </div>
              {auction.auctionDuration > 0 && (
                <div className="text-right">
                  <div className="text-[11px] font-black text-[#7b8a96]">남은 시간</div>
                  <div className="text-5xl font-black leading-none" style={{ color: timerColor }}>{timeLeft}</div>
                </div>
              )}
            </div>

            {currentPlayer ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[160px_minmax(0,1fr)]">
                {currentPlayer.user.image ? (
                  <img src={currentPlayer.user.image} alt="" className="h-40 w-40 rounded-xl object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="h-40 w-40 rounded-xl bg-[#24313c]" />
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-4xl font-black sm:text-5xl">{playerName(currentPlayer)}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentPlayer.user.riotAccounts.map((account) => (
                      <span key={`${account.gameName}-${account.tagLine}`} className="rounded bg-[#1a2633] px-3 py-1 text-sm font-bold text-[#c8d3db]">
                        {account.region.toUpperCase()} · {account.gameName}#{account.tagLine}
                        {account.cachedTierName && <span className="ml-2 text-[#ff8a95]">{account.cachedTierName}</span>}
                      </span>
                    ))}
                    {currentPlayer.user.valorantRole && <span className="rounded bg-[#263442] px-3 py-1 text-sm font-bold text-[#c8d3db]">{currentPlayer.user.valorantRole}</span>}
                  </div>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[#263442] bg-[#0a1320] p-4">
                      <div className="text-[11px] font-black text-[#7b8a96]">최고 입찰</div>
                      <div className="mt-1 text-4xl font-black text-[#f6c945]">{highestBid.toLocaleString()}P</div>
                      <div className="mt-1 text-sm font-bold text-[#9aa8b3]">{highestCaptainId ? playerName(playerMap.get(highestCaptainId)) : "아직 입찰 없음"}</div>
                    </div>
                    <div className="rounded-lg border border-[#263442] bg-[#0a1320] p-4">
                      <div className="text-[11px] font-black text-[#7b8a96]">내전 방식</div>
                      <div className="mt-1 text-2xl font-black">{auction.phase === "reauction" ? "유찰자 재경매" : "일반 경매"}</div>
                      <div className="mt-1 text-sm font-bold text-[#9aa8b3]">팀장별 포인트로 1명씩 낙찰</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-[#7b8a96]">{auction.phase === "done" ? "경매가 완료되었습니다." : "현재 경매 중인 참가자가 없습니다."}</div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-[#263442] bg-[#101925] p-5">
              {access.role === "captain" ? (
                <>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">MY BID</div>
                  <div className="mt-2 text-sm text-[#9aa8b3]">보유 포인트</div>
                  <div className="text-4xl font-black text-white">{myPoints.toLocaleString()}P</div>
                  {myBid > 0 && <div className="mt-1 text-sm font-bold text-[#f6c945]">현재 내 입찰: {myBid.toLocaleString()}P</div>}
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[10, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        disabled={!canBid || submitting}
                        onClick={() => setBidAmount(String(Math.min(myPoints, Math.max(highestBid, myBid) + step)))}
                        className="rounded border border-[#314255] bg-[#162232] px-3 py-2 text-xs font-black text-[#dce7ef] disabled:opacity-40"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={myPoints}
                      value={bidAmount}
                      onChange={(event) => setBidAmount(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canBid) void sendAction("bid", { bidAmount: parseInt(bidAmount, 10) || 0 });
                      }}
                      disabled={!canBid || submitting}
                      placeholder="입찰 금액"
                      className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#f6c945] disabled:opacity-40"
                    />
                    <button type="button" disabled={!canBid || submitting} onClick={() => void sendAction("bid", { bidAmount: parseInt(bidAmount, 10) || 0 })} className="rounded bg-[#f6c945] px-5 py-3 text-sm font-black text-black disabled:opacity-40">
                      입찰
                    </button>
                  </div>
                </>
              ) : access.role === "host" ? (
                <>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">HOST CONTROLS</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" disabled={submitting} onClick={() => void sendAction("resolve")} className="rounded bg-[#00e7c2] px-4 py-3 text-sm font-black text-black disabled:opacity-40">
                      낙찰 처리
                    </button>
                    <button type="button" disabled={submitting} onClick={() => void sendAction("pass")} className="rounded border border-[#ff4655]/45 bg-[#ff4655]/10 px-4 py-3 text-sm font-black text-[#ff8a95] disabled:opacity-40">
                      유찰
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm font-bold text-[#9aa8b3]">옵저버 링크입니다. 경매 현황만 볼 수 있습니다.</div>
              )}
            </div>

            <div className="rounded-lg border border-[#263442] bg-[#101925] p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">LIVE BIDS</div>
              <div className="mt-3 space-y-2">
                {currentLotBids.length === 0 ? (
                  <div className="rounded border border-dashed border-[#263442] py-6 text-center text-xs font-bold text-[#7b8a96]">아직 입찰이 없습니다</div>
                ) : currentLotBids.map((bid) => (
                  <div key={bid.id} className="flex items-center justify-between gap-2 rounded bg-[#0a1320] px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-bold text-[#dce7ef]">{playerName(playerMap.get(bid.captainId))}</span>
                    <span className="text-sm font-black text-[#f6c945]">{bid.amount.toLocaleString()}P</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
