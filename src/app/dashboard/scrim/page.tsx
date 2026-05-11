"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

interface ScrimSettings {
  showRiotNickname: boolean;
  showDiscordNickname: boolean;
  showRankTier: boolean;
  showValorantRole: boolean;
  showFavoriteAgents: boolean;
}

interface ScrimSession {
  id: string;
  title: string;
  description: string | null;
  settings: string | null;
  scheduledAt: string | null;
  recruitmentChannelId: string | null;
  status: string;
  mode: string | null;
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

interface DiscordChannel {
  id: string;
  name: string;
}

const DEFAULT_SETTINGS: ScrimSettings = {
  showRiotNickname: true,
  showDiscordNickname: true,
  showRankTier: true,
  showValorantRole: true,
  showFavoriteAgents: true,
};

const SETTING_LABELS: Array<{ key: keyof ScrimSettings; label: string; description: string }> = [
  { key: "showRiotNickname", label: "라이엇 닉네임", description: "연동된 한섭/아섭 Riot ID" },
  { key: "showDiscordNickname", label: "디스코드 닉네임", description: "발로세끼 서버 닉네임" },
  { key: "showRankTier", label: "랭크 티어", description: "프로필에 저장된 현재 티어" },
  { key: "showValorantRole", label: "역할군", description: "감시자/타격대/척후대/전략가" },
  { key: "showFavoriteAgents", label: "모스트 3 요원", description: "프로필에 저장한 주 요원" },
];

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
  return "모집/진행 중";
}

function parseSettings(value: string | null): ScrimSettings {
  if (!value) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<ScrimSettings>;
    return {
      showRiotNickname: parsed.showRiotNickname !== false,
      showDiscordNickname: parsed.showDiscordNickname !== false,
      showRankTier: parsed.showRankTier !== false,
      showValorantRole: parsed.showValorantRole !== false,
      showFavoriteAgents: parsed.showFavoriteAgents !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function ScrimPage() {
  const [scrims, setScrims] = useState<ScrimSession[]>([]);
  const [kdRanking, setKdRanking] = useState<KdRankingPlayer[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createScheduledDate, setCreateScheduledDate] = useState("");
  const [createScheduledTime, setCreateScheduledTime] = useState("");
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [manualChannelId, setManualChannelId] = useState("");
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [createSettings, setCreateSettings] = useState<ScrimSettings>(DEFAULT_SETTINGS);
  const [createMode, setCreateMode] = useState<"normal" | "auction">("normal");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/scrim", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/me/roles", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({ isAdmin: false })),
    ])
      .then(([scrimData, roleData]) => {
        setScrims(scrimData.sessions ?? []);
        setKdRanking(scrimData.kdRanking ?? []);
        setIsAdmin(Boolean(roleData.isAdmin));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!createOpen || channels.length > 0) return;
    setChannelLoading(true);
    setChannelError(null);
    fetch("/api/scrim/channels", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setChannels(data.channels ?? []);
        if (data.error) setChannelError(data.error);
        else if ((data.channels ?? []).length === 0) setChannelError("선택 가능한 텍스트 채널이 없습니다.");
      })
      .catch(() => {
        setChannels([]);
        setChannelError("채널 목록을 불러오지 못했습니다.");
      })
      .finally(() => setChannelLoading(false));
  }, [channels.length, createOpen, isAdmin]);

  const visibleScrims = useMemo(() => scrims, [scrims]);

  async function deleteScrim(id: string) {
    if (!isAdmin || deletingId) return;
    const confirmed = window.confirm("내전 기록을 삭제할까요?");
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

  async function createScrim() {
    if (creating) return;
    const title = createTitle.trim();
    if (!title) {
      setMessage("내전 제목을 입력해 주세요.");
      return;
    }
    const channelId = selectedChannelId || manualChannelId.trim();
    if (!channelId) {
      setMessage("모집 글을 올릴 채널을 선택하거나 채널 ID를 입력해 주세요.");
      return;
    }

    // 날짜 + 시간 합산하여 scheduledAt 생성
    let scheduledAt: string | null = null;
    if (createScheduledDate) {
      const timeStr = createScheduledTime || "00:00";
      scheduledAt = `${createScheduledDate}T${timeStr}:00`;
    }

    setCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/scrim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: createDescription,
          scheduledAt,
          channelId,
          settings: createSettings,
          mode: createMode,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "내전 생성에 실패했습니다.");

      setScrims((current) => [data.scrim, ...current]);
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateScheduledDate("");
      setCreateScheduledTime("");
      setSelectedChannelId("");
      setManualChannelId("");
      setCreateSettings(DEFAULT_SETTINGS);
      setCreateMode("normal");
      setMessage("내전 카드를 생성했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내전 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  function openCreateModal() {
    setMessage(null);
    setCreateOpen(true);
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
            생성된 내전 목록과 내전 KD 랭킹을 확인합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/scrim/ranking" className="val-btn border border-[#2a3540] bg-[#0f1923] px-4 py-2 text-xs font-black text-white hover:border-[#ff4655]/50">
            KD 랭킹
          </Link>
          <button type="button" onClick={openCreateModal} className="val-btn bg-[#ff4655] px-4 py-2 text-xs font-black text-white">
            내전 생성
          </button>
        </div>
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
                  const settings = parseSettings(scrim.settings);

                  return (
                    <article key={scrim.id} className="val-card p-5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-black text-white">{scrim.title}</h3>
                            {scrim.mode === "auction" ? (
                              <span className="rounded bg-[#f6c945]/15 px-2 py-0.5 text-[10px] font-black text-[#f6c945]">🏷 경매</span>
                            ) : (
                              <span className="rounded bg-[#ff4655]/10 px-2 py-0.5 text-[10px] font-black text-[#ff8a95]">⚔ 일반</span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[#7b8a96]">
                            생성 {formatDate(scrim.createdAt)}
                            {scrim.scheduledAt ? ` · 시작 ${new Date(scrim.scheduledAt).toLocaleString("ko-KR")}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <a
                            href={`/dashboard/scrim/${scrim.id}`}
                            className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-1 text-xs font-black text-[#c8d3db] hover:border-[#ff4655]/50 hover:text-white"
                          >
                            열기
                          </a>
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

                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {SETTING_LABELS.filter((item) => settings[item.key]).map((item) => (
                          <span key={item.key} className="rounded bg-[#ff4655]/10 px-2 py-1 text-[11px] font-black text-[#ff8a95]">
                            {item.label}
                          </span>
                        ))}
                      </div>

                      <div className="text-xs text-[#7b8a96]">
                        참가자 {scrim.players.length}명 · Team A {teamA.length}명 · Team B {teamB.length}명
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

      {createOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <div className="val-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">내전 생성</h2>
                <p className="mt-0.5 text-xs text-[#7b8a96]">내전 카드에 표시할 정보와 설명을 설정합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-xs font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white"
              >
                닫기
              </button>
            </div>

            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-sm font-black text-white">내전 모드</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateMode("normal")}
                    className={`rounded border px-3 py-3 text-left transition-colors ${
                      createMode === "normal"
                        ? "border-[#ff4655] bg-[#ff4655]/12 text-white"
                        : "border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#ff4655]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">⚔ 일반 내전</span>
                      <span className={`h-3 w-3 rounded-full flex-shrink-0 ${createMode === "normal" ? "bg-[#ff4655]" : "bg-[#2a3540]"}`} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#7b8a96]">
                      관리자가 직접 팀을 구성하는 일반 방식의 내전입니다.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode("auction")}
                    className={`rounded border px-3 py-3 text-left transition-colors ${
                      createMode === "auction"
                        ? "border-[#f6c945] bg-[#f6c945]/10 text-white"
                        : "border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3] hover:border-[#f6c945]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">🏷 경매 내전</span>
                      <span className={`h-3 w-3 rounded-full flex-shrink-0 ${createMode === "auction" ? "bg-[#f6c945]" : "bg-[#2a3540]"}`} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#7b8a96]">
                      팀장이 포인트를 사용해 팀원을 경매로 지명하는 방식입니다.
                    </p>
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-white">제목</h3>
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  maxLength={80}
                  placeholder="예: 금요일 5대5 밸런스 내전"
                  className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-[#56636f] focus:border-[#ff4655]"
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-white">설명</h3>
                <textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="내전 컨셉, 참가 조건, 요구 사항, 진행 방식 등을 입력하세요."
                  className="w-full resize-none rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 text-sm font-bold leading-relaxed text-white outline-none transition-colors placeholder:text-[#56636f] focus:border-[#ff4655]"
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-white">시작 시간 <span className="text-[11px] font-normal text-[#7b8a96]">(optional)</span></h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">날짜</label>
                    <input
                      type="date"
                      value={createScheduledDate}
                      onChange={(e) => setCreateScheduledDate(e.target.value)}
                      className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-[#ff4655] [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">시간</label>
                    <input
                      type="time"
                      value={createScheduledTime}
                      onChange={(e) => setCreateScheduledTime(e.target.value)}
                      disabled={!createScheduledDate}
                      className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-[#ff4655] disabled:opacity-40 [color-scheme:dark]"
                    />
                  </div>
                </div>
                {createScheduledDate && (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-[#7b8a96]">
                      선택된 시간: {new Date(`${createScheduledDate}T${createScheduledTime || "00:00"}:00`).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </p>
                    <button type="button" onClick={() => { setCreateScheduledDate(""); setCreateScheduledTime(""); }} className="text-[11px] text-[#7b8a96] hover:text-[#ff4655]">시간 제거</button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-white">설정</h3>
                <p className="mb-3 text-xs text-[#7b8a96]">
                  참가자 카드에 어떤 정보를 보여줄지 선택합니다. 선택한 정보는 각자의 웹 프로필에 저장된 값을 기준으로 표시됩니다.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SETTING_LABELS.map((item) => {
                    const checked = createSettings[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setCreateSettings((current) => ({
                            ...current,
                            [item.key]: !current[item.key],
                          }))
                        }
                        className={`rounded border px-3 py-3 text-left transition-colors ${
                          checked
                            ? "border-[#ff4655] bg-[#ff4655]/12 text-white"
                            : "border-[#2a3540] bg-[#0f1923]/70 text-[#9aa8b3]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-black">{item.label}</span>
                          <span className={`h-3 w-3 rounded-full ${checked ? "bg-[#ff4655]" : "bg-[#2a3540]"}`} />
                        </div>
                        <div className="mt-1 text-[11px] text-[#7b8a96]">{item.description}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-white">모집 글을 올릴 채널</h3>
                <p className="mb-3 text-xs text-[#9aa8b3]">
                  발로세끼 봇이 선택한 채널에 제목/설명과 참가 이모지 안내를 올립니다.
                </p>
                {channelLoading && (
                  <div className="mb-3 rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-xs font-bold text-[#9aa8b3]">
                    채널 목록을 불러오는 중...
                  </div>
                )}
                {channelError && (
                  <div className="mb-2 rounded border border-[#2a3540] bg-[#0f1923]/70 px-3 py-2 text-xs text-[#7b8a96]">
                    {channelError} — 아래에 채널 ID를 직접 입력하세요.
                  </div>
                )}
                {channels.length > 0 && (
                  <select
                    value={selectedChannelId}
                    onChange={(event) => {
                      setSelectedChannelId(event.target.value);
                      if (event.target.value) setManualChannelId("");
                    }}
                    className="mb-3 w-full rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-[#ff4655]"
                  >
                    <option value="">채널 선택</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-black text-[#7b8a96]">
                    채널 ID 직접 입력 <span className="font-normal text-[#56636f]">(Discord 채널 우클릭 → ID 복사)</span>
                  </label>
                  <input
                    value={manualChannelId}
                    onChange={(event) => {
                      setManualChannelId(event.target.value);
                      if (event.target.value) setSelectedChannelId("");
                    }}
                    placeholder="예: 123456789012345678"
                    className="w-full rounded border border-[#2a3540] bg-[#0b141c] px-4 py-3 font-mono text-sm font-bold text-white outline-none transition-colors placeholder:text-[#56636f] focus:border-[#ff4655]"
                  />
                </div>
              </section>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded border border-[#2a3540] bg-[#0f1923]/70 px-5 py-2 text-sm font-black text-[#9aa8b3] hover:border-[#ff4655]/50 hover:text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={createScrim}
                disabled={creating}
                className="val-btn bg-[#ff4655] px-5 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {creating ? "생성 중" : "생성"}
              </button>
            </div>
          </div>
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
