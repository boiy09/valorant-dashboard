"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";

interface RiotAccount {
  gameName: string;
  tagLine: string;
  region: string;
  cachedTierName: string | null;
}

interface AgentOption {
  name: string;
  icon: string | null;
  portrait: string | null;
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
    guilds?: { guildId: string; nickname: string | null }[];
    riotAccounts: RiotAccount[];
  };
}

interface ScrimRoom {
  id: string;
  title: string;
  description: string | null;
  guildId: string;
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
  joinedCaptains?: string;
  pausedPhase?: string | null;
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
  viewer: { id: string; name: string | null; image: string | null; matchesCaptain: boolean | null } | null;
}

const TEAM_COLORS = ["#ff4655", "#f6c945", "#00e7c2", "#7c9cff", "#b884ff", "#ff9f43"];
const MIN_BID_INCREMENT = 10;
const ROLE_LABELS: Record<string, string> = {
  Duelist: "타격대",
  Initiator: "척후대",
  Controller: "전략가",
  Sentinel: "감시자",
  duelist: "타격대",
  initiator: "척후대",
  controller: "전략가",
  sentinel: "감시자",
};

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

function playerName(player?: AuctionPlayer | null, guildId?: string) {
  const serverNick = guildId ? player?.user.guilds?.find((guild) => guild.guildId === guildId)?.nickname : null;
  return serverNick || player?.user.name || "이름 없음";
}

function parseAgents(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase();
}

function toRoleLabels(value: string | null | undefined) {
  if (!value) return [];
  return value.split(",").map((role) => role.trim()).filter(Boolean).map((role) => ROLE_LABELS[role] ?? role);
}

function toRoleText(value: string | null | undefined) {
  return toRoleLabels(value).join(", ");
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

function LotNameCard({ player, label, guildId, muted = false }: { player?: AuctionPlayer | null; label: string; guildId?: string; muted?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 ${muted ? "border-[#263442] bg-[#0b141c]/70 opacity-80" : "border-[#314255] bg-[#101925]"}`}>
      {player?.user.image ? (
        <img src={player.user.image} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
      ) : (
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#24313c] text-xs font-black text-[#7b8a96]">?</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black text-white">{playerName(player, guildId)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-[#8fa0ad]">
          <span>{label}</span>
          {player?.user.valorantRole && <span className="max-w-full rounded bg-[#263442] px-1.5 py-0.5 text-[#c8d3db]">{toRoleText(player.user.valorantRole)}</span>}
          {player?.user.riotAccounts[0]?.cachedTierName && <span className="text-[#ff8a95]">{player.user.riotAccounts[0].cachedTierName}</span>}
        </div>
      </div>
    </div>
  );
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
  const [hostCaptainId, setHostCaptainId] = useState("");
  const [hostBidAmount, setHostBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [agentPortraits, setAgentPortraits] = useState<Record<string, string>>({});
  const auctionForTimer = room?.auction;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/valorant/agents", { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { agents?: AgentOption[] } | null) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const agent of payload?.agents ?? []) {
          const image = agent.portrait || agent.icon;
          if (agent.name && image) next[normalizeAgentKey(agent.name)] = image;
        }
        setAgentPortraits(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
    const joinedCaptains = parseJson<string[]>(auction?.joinedCaptains, []);
    const captainIds = Object.keys(captainPoints);
    const currentPlayer = auction?.currentUserId ? playerMap.get(auction.currentUserId) : null;
    const picks = auction?.picks ?? [];
    const bidHistory = auction?.bidHistory ?? [];
    const currentBidRows = Object.entries(currentBids)
      .map(([captainId, amount]) => ({ captainId, amount }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { players, playerMap, captainPoints, currentBids, queue, failedQueue, joinedCaptains, captainIds, currentPlayer, picks, bidHistory, currentBidRows };
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
  const { captainPoints, currentBids, queue, failedQueue, joinedCaptains, captainIds, currentPlayer, playerMap, picks, bidHistory, currentBidRows } = derived;
  const myCaptainId = access.captainId;
  const myCaptain = myCaptainId ? playerMap.get(myCaptainId) : null;
  const roomRoleLabel = access.role === "captain" && myCaptain ? `${playerName(myCaptain, scrim.guildId)} 팀` : formatRole(access.role);
  const myPoints = myCaptainId ? captainPoints[myCaptainId] ?? 0 : 0;
  const myBid = myCaptainId ? currentBids[myCaptainId] ?? 0 : 0;
  const highestBid = currentBidRows[0]?.amount ?? 0;
  const highestCaptainId = currentBidRows[0]?.captainId ?? null;
  const hasPassedCurrentLot = !!myCaptainId && currentBids[myCaptainId] === -1;
  const highestOtherBid = myCaptainId ? Math.max(0, ...currentBidRows.filter((row) => row.captainId !== myCaptainId).map((row) => row.amount)) : highestBid;
  const minimumBid = Math.max(MIN_BID_INCREMENT, highestOtherBid + MIN_BID_INCREMENT, myBid > 0 ? myBid + MIN_BID_INCREMENT : MIN_BID_INCREMENT);
  const isLeading = !!myCaptainId && myCaptainId === highestCaptainId && myBid > 0;
  const canBid = access.role === "captain" && room.viewer?.matchesCaptain === true && !hasPassedCurrentLot && !isLeading && (auction.phase === "auction" || auction.phase === "reauction") && !!auction.currentUserId;
  const timerPct = auction.auctionDuration > 0 ? Math.max(0, Math.min(100, (timeLeft / auction.auctionDuration) * 100)) : 0;
  const timerColor = timerPct > 45 ? "#00e7c2" : timerPct > 20 ? "#f6c945" : "#ff4655";
  const currentLotBids = bidHistory.filter((bid) => bid.lotUserId === auction.currentUserId).slice(-8).reverse();
  const currentRoleText = currentPlayer ? toRoleText(currentPlayer.user.valorantRole) : "";
  const currentAgents = currentPlayer ? parseAgents(currentPlayer.user.favoriteAgents).slice(0, 3) : [];
  const lotCards = [
    ...(currentPlayer ? [{ userId: currentPlayer.user.id, label: "현재 매물", muted: false }] : []),
    ...queue.map((userId, index) => ({ userId, label: `대기 ${index + 1}`, muted: false })),
    ...failedQueue.map((userId, index) => ({ userId, label: `유찰 ${index + 1}`, muted: true })),
  ].filter((lot, index, lots) => lots.findIndex((item) => item.userId === lot.userId && item.label === lot.label) === index);
  const allCaptainsJoined = captainIds.length > 0 && joinedCaptains.length >= captainIds.length;
  const canBeginAuction = auction.phase === "setup" && queue.length > 0;

  return (
    <main className="min-h-screen bg-[#07111d] text-white">
      <div className="border-b border-[#263442] bg-[#0d1722]/95 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[#f6c945]">AUCTION ROOM</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{scrim.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-[#2f4052] bg-[#111f2e] px-3 py-2 text-xs font-black text-[#c8d3db]">{roomRoleLabel}</span>
            <span className="rounded border border-[#f6c945]/45 bg-[#f6c945]/10 px-3 py-2 text-xs font-black text-[#ffe089]">{phaseLabel(auction.phase)}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {message && <div className="mb-4 rounded border border-[#314255] bg-[#162232] px-4 py-3 text-sm font-bold text-[#dce7ef]">{message}</div>}

        {access.role === "captain" && (
          <div className={`mb-4 rounded-lg border px-4 py-3 ${room.viewer?.matchesCaptain === false ? "border-[#ff4655]/50 bg-[#ff4655]/10" : "border-[#00e7c2]/35 bg-[#00e7c2]/10"}`}>
            <div className="text-sm font-black text-white">{roomRoleLabel} 전용 링크</div>
            <div className="mt-1 text-xs font-bold text-[#c8d3db]">
              {room.viewer
                ? room.viewer.matchesCaptain
                  ? `현재 Discord 로그인: ${room.viewer.name ?? "이름 없음"} · 본인 확인 완료`
                  : `현재 Discord 로그인: ${room.viewer.name ?? "이름 없음"} · 이 링크의 팀장과 다릅니다`
                : "Discord 로그인 상태를 확인할 수 없습니다. 로그인하면 본인 여부가 표시됩니다."}
            </div>
          </div>
        )}

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
                      <div className="mt-1 truncate text-sm font-black">{playerName(captain, scrim.guildId)}</div>
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
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#dce7ef]">{playerName(member, scrim.guildId)}</span>
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

            {auction.phase === "setup" ? (
              <div className="mt-8 rounded-lg border border-[#263442] bg-[#0a1320] p-6">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#00e7c2]">CAPTAIN CHECK-IN</div>
                <h2 className="mt-2 text-3xl font-black text-white">팀장 입장 확인 중</h2>
                <p className="mt-2 text-sm font-bold text-[#9aa8b3]">팀장 링크 접속 여부를 확인한 뒤 주최자 링크에서 경매를 시작하세요.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {captainIds.map((captainId, index) => {
                    const captain = playerMap.get(captainId);
                    const joined = joinedCaptains.includes(captainId);
                    return (
                      <div key={captainId} className="flex items-center justify-between gap-3 rounded border border-[#263442] bg-[#101925] px-3 py-3">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-[#7b8a96]">{teamName(index)}</div>
                          <div className="truncate text-sm font-black text-white">{playerName(captain, scrim.guildId)} 팀</div>
                        </div>
                        <span className={`rounded px-2 py-1 text-[11px] font-black ${joined ? "bg-[#00e7c2]/15 text-[#7fffe6]" : "bg-[#263442] text-[#9aa8b3]"}`}>
                          {joined ? "입장 완료" : "대기"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : currentPlayer ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[160px_minmax(0,1fr)]">
                {currentPlayer.user.image ? (
                  <img src={currentPlayer.user.image} alt="" className="h-40 w-40 rounded-xl object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="h-40 w-40 rounded-xl bg-[#24313c]" />
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-4xl font-black sm:text-5xl">{playerName(currentPlayer, scrim.guildId)}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentPlayer.user.riotAccounts.map((account) => (
                      <span key={`${account.gameName}-${account.tagLine}`} className="rounded bg-[#1a2633] px-3 py-1 text-sm font-bold text-[#c8d3db]">
                        {account.region.toUpperCase()} · {account.gameName}#{account.tagLine}
                        {account.cachedTierName && <span className="ml-2 text-[#ff8a95]">{account.cachedTierName}</span>}
                      </span>
                    ))}
                    {currentRoleText && <span className="max-w-full rounded bg-[#263442] px-3 py-1 text-sm font-bold text-[#c8d3db]">{currentRoleText}</span>}
                  </div>
                  {currentAgents.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b8a96]">MOST AGENTS</span>
                      {currentAgents.map((agent, index) => {
                        const portrait = agentPortraits[normalizeAgentKey(agent)];
                        return portrait ? (
                          <img
                            key={`${agent}-${index}`}
                            src={portrait}
                            alt={agent}
                            title={agent}
                            className="h-11 w-11 rounded-lg bg-[#24313c] object-cover object-top ring-1 ring-white/10"
                          />
                        ) : (
                          <span key={`${agent}-${index}`} title={agent} className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#24313c] text-xs font-black text-[#c8d3db]">
                            {agent.slice(0, 1)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[#263442] bg-[#0a1320] p-4">
                      <div className="text-[11px] font-black text-[#7b8a96]">최고 입찰</div>
                      <div className="mt-1 text-4xl font-black text-[#f6c945]">{highestBid.toLocaleString()}P</div>
                      <div className="mt-1 text-sm font-bold text-[#9aa8b3]">{highestCaptainId ? playerName(playerMap.get(highestCaptainId), scrim.guildId) : "아직 입찰 없음"}</div>
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
                  {hasPassedCurrentLot && <div className="mt-2 rounded border border-[#ff4655]/35 bg-[#ff4655]/10 px-3 py-2 text-xs font-black text-[#ff8a95]">이 매물 경매를 포기했습니다</div>}
                  {auction.phase === "setup" && myCaptainId && (
                    <button
                      type="button"
                      disabled={submitting || room.viewer?.matchesCaptain !== true || joinedCaptains.includes(myCaptainId)}
                      onClick={() => void sendAction("confirmJoin")}
                      className="mt-5 w-full rounded-lg border border-[#7fffe6]/50 bg-[#00e7c2] px-5 py-4 text-base font-black text-[#02110f] shadow-lg shadow-[#00e7c2]/20 transition hover:bg-[#42ffe2] disabled:border-[#263442] disabled:bg-[#263442] disabled:text-[#7b8a96] disabled:shadow-none"
                    >
                      {joinedCaptains.includes(myCaptainId) ? "경매 준비 완료" : "경매 준비하기"}
                    </button>
                  )}
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[10, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        disabled={!canBid || submitting}
                        onClick={() => setBidAmount((current) => String(Math.min(myPoints, (parseInt(current, 10) || 0) + step)))}
                        className="rounded border border-[#314255] bg-[#162232] px-3 py-2 text-xs font-black text-[#dce7ef] disabled:opacity-40"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                  {canBid && <div className="mt-2 text-xs font-bold text-[#7b8a96]">최소 입찰가 {minimumBid.toLocaleString()}P</div>}
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      min={minimumBid}
                      max={myPoints}
                      value={bidAmount}
                      onChange={(event) => setBidAmount(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canBid) void sendAction("bid", { bidAmount: parseInt(bidAmount, 10) || 0 });
                      }}
                      disabled={!canBid || submitting}
                      placeholder={`최소 ${minimumBid.toLocaleString()}P`}
                      className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#f6c945] disabled:opacity-40"
                    />
                    <button type="button" disabled={!canBid || submitting} onClick={() => void sendAction("bid", { bidAmount: parseInt(bidAmount, 10) || 0 })} className="rounded bg-[#f6c945] px-5 py-3 text-sm font-black text-black disabled:opacity-40">
                      입찰
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!canBid || submitting}
                    onClick={() => void sendAction("captainPass")}
                    className="mt-2 w-full rounded border border-[#ff4655]/45 bg-[#ff4655]/10 px-4 py-3 text-sm font-black text-[#ff8a95] transition hover:bg-[#ff4655]/18 disabled:opacity-40"
                  >
                    유찰
                  </button>
                </>
              ) : access.role === "host" ? (
                <>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">HOST CONTROLS</div>
                  {auction.phase === "setup" && (
                    <div className="mt-4">
                      <div className="mb-3 rounded border border-[#263442] bg-[#0a1320] px-3 py-2 text-xs font-bold text-[#c8d3db]">
                        팀장 입장 {joinedCaptains.length}/{captainIds.length}명
                      </div>
                      <button
                        type="button"
                        disabled={submitting || !canBeginAuction}
                        title={queue.length === 0 ? "경매 매물이 없습니다." : !allCaptainsJoined ? "테스트 모드: 팀장 대기 상태여도 시작할 수 있습니다." : undefined}
                        onClick={() => void sendAction("begin")}
                        className="w-full rounded bg-[#f6c945] px-4 py-3 text-sm font-black text-black disabled:opacity-40"
                      >
                        경매 시작
                      </button>
                    </div>
                  )}
                  {auction.phase !== "setup" && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {auction.phase === "paused" ? (
                        <button type="button" disabled={submitting} onClick={() => void sendAction("resume")} className="rounded bg-[#00e7c2] px-4 py-3 text-sm font-black text-black disabled:opacity-40">
                          재개
                        </button>
                      ) : (
                        <button type="button" disabled={submitting || !currentPlayer} onClick={() => void sendAction("pause")} className="rounded border border-[#314255] bg-[#162232] px-4 py-3 text-sm font-black text-[#dce7ef] disabled:opacity-40">
                          일시정지
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" disabled={submitting || !currentPlayer || auction.phase === "setup" || auction.phase === "paused"} onClick={() => void sendAction("resolve")} className="rounded bg-[#00e7c2] px-4 py-3 text-sm font-black text-black disabled:opacity-40">
                      낙찰 처리
                    </button>
                    <button type="button" disabled={submitting || !currentPlayer || auction.phase === "setup" || auction.phase === "paused"} onClick={() => void sendAction("pass")} className="rounded border border-[#ff4655]/45 bg-[#ff4655]/10 px-4 py-3 text-sm font-black text-[#ff8a95] disabled:opacity-40">
                      유찰
                    </button>
                  </div>
                  {auction.phase !== "setup" && (
                    <div className="mt-4 space-y-2 border-t border-[#263442] pt-4">
                      <select value={hostCaptainId} onChange={(event) => setHostCaptainId(event.target.value)} className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#f6c945]">
                        <option value="">낙찰 팀장 선택</option>
                        {captainIds.map((captainId) => (
                          <option key={captainId} value={captainId}>{playerName(playerMap.get(captainId), scrim.guildId)} 팀</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          value={hostBidAmount}
                          onChange={(event) => setHostBidAmount(event.target.value)}
                          placeholder="낙찰 금액"
                          className="min-w-0 flex-1 rounded border border-[#2a3540] bg-[#0b141c] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#f6c945]"
                        />
                        <button
                          type="button"
                          disabled={submitting || !currentPlayer || auction.phase === "paused" || !hostCaptainId}
                          onClick={() => void sendAction("forceAssign", { captainId: hostCaptainId, bidAmount: parseInt(hostBidAmount, 10) || 0 })}
                          className="rounded bg-[#f6c945] px-4 py-3 text-sm font-black text-black disabled:opacity-40"
                        >
                          선택 낙찰
                        </button>
                      </div>
                    </div>
                  )}
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
                    <span className="min-w-0 truncate text-sm font-bold text-[#dce7ef]">{playerName(playerMap.get(bid.captainId), scrim.guildId)}</span>
                    <span className="text-sm font-black text-[#f6c945]">{bid.amount.toLocaleString()}P</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#263442] bg-[#101925] p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a96]">FAILED LOTS</div>
                <div className="text-xs font-bold text-[#7b8a96]">{failedQueue.length}명</div>
              </div>
              <div className="mt-3 space-y-2">
                {failedQueue.length === 0 ? (
                  <div className="rounded border border-dashed border-[#263442] py-6 text-center text-xs font-bold text-[#7b8a96]">유찰된 참가자가 없습니다</div>
                ) : failedQueue.map((userId, index) => (
                  <LotNameCard key={`failed-${userId}-${index}`} player={playerMap.get(userId)} label={`유찰 ${index + 1}`} guildId={scrim.guildId} muted />
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-5 rounded-lg border border-[#263442] bg-[#101925] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7fffe6]">AUCTION LOTS</div>
            <div className="text-xs font-bold text-[#7b8a96]">매물 {lotCards.length}명</div>
          </div>
          {lotCards.length === 0 ? (
            <div className="rounded border border-dashed border-[#263442] py-8 text-center text-xs font-bold text-[#7b8a96]">
              경매 매물이 없습니다. 참가자 로드 후 팀장이 아닌 참가자를 남겨 주세요.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {lotCards.map((lot) => (
                <LotNameCard key={`${lot.label}-${lot.userId}`} player={playerMap.get(lot.userId)} label={lot.label} guildId={scrim.guildId} muted={lot.muted} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
