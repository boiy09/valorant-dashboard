"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RiotRegion = "KR" | "AP";
type FormState = "idle" | "qr_loading" | "qr_show" | "qr_polling" | "success" | "error";

interface RiotAccountItem {
  id: string;
  region: RiotRegion;
  riotId: string;
  isVerified: boolean;
}

const REGIONS: RiotRegion[] = ["KR", "AP"];
const POLL_INTERVAL_MS = 3000;
const QR_EXPIRE_MS = 5 * 60 * 1000; // 5분

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한섭" : "아섭";
}

/** QR 코드 이미지 URL (외부 API 사용, 패키지 불필요) */
function qrImageUrl(content: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(content)}`;
}

/** Riot Mobile 앱이 스캔할 딥링크 */
function buildQrContent(loginToken: string) {
  return `riotgames://riot/login?login_token=${loginToken}`;
}

export default function HeaderRiotLink() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [loginToken, setLoginToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [qrExpireAt, setQrExpireAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ──────── 계정 목록 로드 ────────
  useEffect(() => {
    fetch("/api/user/riot")
      .then((r) => (r.ok ? r.json() : { linked: false, accounts: [] }))
      .then((data: { accounts?: RiotAccountItem[] }) => {
        setAccounts(data.accounts ?? []);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  // ──────── 외부 클릭 닫기 ────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ──────── 패널 닫힐 때 폴링 정리 ────────
  useEffect(() => {
    if (!open) {
      stopPolling();
      if (formState === "qr_show" || formState === "qr_polling") {
        setFormState("idle");
        setLoginToken("");
        setDeviceId("");
        setQrExpireAt(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  // ──────── QR 만료 카운트다운 ────────
  useEffect(() => {
    if (!qrExpireAt) return;
    countdownRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((qrExpireAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        stopPolling();
        setFormState("error");
        setError("QR 코드가 만료되었습니다. 다시 시도해 주세요.");
      }
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [qrExpireAt]);

  const accountByRegion = useMemo(() => {
    const map = new Map<RiotRegion, RiotAccountItem>();
    for (const a of accounts) map.set(a.region, a);
    return map;
  }, [accounts]);

  const connectedCount = accounts.length;
  const summaryLabel =
    connectedCount === 0
      ? "라이엇 연동"
      : REGIONS.map((k) => {
          const a = accountByRegion.get(k);
          return `${k}:${a ? (a.isVerified ? "인증됨" : "비인증") : "없음"}`;
        }).join(" · ");

  // ──────── 폴링 로직 ────────
  const poll = useCallback(
    async (token: string, dId: string) => {
      try {
        const res = await fetch(
          `/api/user/riot/qr?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(dId)}`,
          { cache: "no-store" }
        );
        const data = await res.json() as {
          status?: string;
          account?: RiotAccountItem;
          error?: string;
          debug?: unknown;
        };

        if (data.status === "success" && data.account) {
          stopPolling();
          setAccounts((prev) => [
            ...prev.filter((a) => a.region !== data.account!.region),
            data.account!,
          ]);
          setFormState("success");
          setLoginToken("");
          setDeviceId("");
          setQrExpireAt(null);
          setTimeout(() => setFormState("idle"), 3000);
          return;
        }

        if (data.status === "expired") {
          stopPolling();
          setFormState("error");
          setError("QR 코드가 만료되었습니다. 다시 시도해 주세요.");
          return;
        }

        if (data.status === "error") {
          stopPolling();
          setFormState("error");
          setError(data.error ?? "인증 중 오류가 발생했습니다.");
          console.error("[QR] 폴링 오류:", data.debug ?? data);
          return;
        }

        // pending - 계속 폴링
        pollTimerRef.current = setTimeout(() => poll(token, dId), POLL_INTERVAL_MS);
      } catch {
        // 네트워크 오류는 재시도
        pollTimerRef.current = setTimeout(() => poll(token, dId), POLL_INTERVAL_MS);
      }
    },
    []
  );

  // ──────── QR 시작 ────────
  async function handleStartQr() {
    setFormState("qr_loading");
    setError("");
    stopPolling();

    try {
      const res = await fetch("/api/user/riot/qr", {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json() as { loginToken?: string; deviceId?: string; error?: string; debug?: unknown };

      if (!res.ok || !data.loginToken) {
        setFormState("error");
        setError(data.error ?? "QR 코드를 생성할 수 없습니다.");
        console.error("[QR] init 실패:", data.debug ?? data);
        return;
      }

      setLoginToken(data.loginToken);
      setDeviceId(data.deviceId ?? "");
      setQrExpireAt(Date.now() + QR_EXPIRE_MS);
      setTimeLeft(Math.round(QR_EXPIRE_MS / 1000));
      setFormState("qr_show");

      // 폴링 시작
      pollTimerRef.current = setTimeout(() => poll(data.loginToken!, data.deviceId ?? ""), POLL_INTERVAL_MS);
    } catch {
      setFormState("error");
      setError("네트워크 오류가 발생했습니다.");
    }
  }

  // ──────── 계정 해제 ────────
  async function handleRemove(id: string) {
    setError("");
    try {
      const res = await fetch("/api/user/riot", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? "계정 해제 중 오류가 발생했습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    }
  }

  function handleReset() {
    stopPolling();
    setFormState("idle");
    setError("");
    setLoginToken("");
    setDeviceId("");
    setQrExpireAt(null);
  }

  if (!initialized) return null;

  const qrContent = loginToken ? buildQrContent(loginToken) : "";
  const isShowingQr = formState === "qr_show" || formState === "qr_polling";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded transition-colors ${
          connectedCount > 0
            ? "border-[#2a3540] hover:border-[#ff4655]/50"
            : "border-[#ff4655]/40 hover:border-[#ff4655] text-[#ff4655]"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            connectedCount > 0 ? "bg-green-400" : "bg-[#ff4655]"
          }`}
        />
        <span
          className={`truncate max-w-[180px] ${connectedCount > 0 ? "text-green-400 font-medium" : ""}`}
        >
          {summaryLabel}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-[#111c24] border border-[#2a3540] rounded shadow-xl z-50 w-80">
          {/* 헤더 */}
          <div className="p-3 border-b border-[#2a3540]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[#7b8a96] text-xs tracking-widest uppercase">라이엇 계정</span>
              <span className="text-[#7b8a96] text-[10px]">{connectedCount}/2 연결</span>
            </div>
            <div className="text-[#7b8a96] text-[11px]">
              한섭(KR)과 아섭(AP) 계정을 각각 1개씩 연결할 수 있습니다.
            </div>
          </div>

          {/* 계정 목록 */}
          <div className="p-2 flex flex-col gap-2 border-b border-[#2a3540]">
            {REGIONS.map((key) => {
              const account = accountByRegion.get(key);
              return (
                <div key={key} className="rounded border border-[#2a3540] bg-[#0f1923] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[#ff4655] text-[10px] tracking-widest uppercase">
                        {key} · {regionLabel(key)}
                      </div>
                      <div className="text-white text-sm font-bold mt-0.5">
                        {account ? account.riotId : "아직 연결된 계정이 없습니다"}
                      </div>
                      {account && (
                        <div className="mt-0.5">
                          {account.isVerified ? (
                            <span className="text-[10px] text-green-400">인증됨</span>
                          ) : (
                            <span className="text-[10px] text-[#ff4655]">인증 필요</span>
                          )}
                        </div>
                      )}
                    </div>
                    {account && (
                      <button
                        onClick={() => handleRemove(account.id)}
                        className="text-[11px] text-[#7b8a96] hover:text-[#ff4655] transition-colors"
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 하단 액션 */}
          <div className="p-3">
            {formState === "success" ? (
              <div className="text-green-400 text-xs text-center py-3">
                ✓ 계정이 성공적으로 연결되었습니다!
              </div>
            ) : isShowingQr ? (
              /* QR 코드 표시 */
              <div className="flex flex-col items-center gap-2">
                <div className="text-[#7b8a96] text-[11px] text-center">
                  Riot Mobile 앱으로 QR 코드를 스캔하세요
                </div>
                <div className="relative bg-white rounded p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImageUrl(qrContent)}
                    alt="Riot Mobile QR 코드"
                    width={180}
                    height={180}
                    className="block"
                  />
                  {/* 스캔 대기 오버레이 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/0 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#7b8a96]">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#ff4655] animate-pulse" />
                  스캔 대기 중... ({timeLeft}초)
                </div>
                <div className="text-[10px] text-[#7b8a96] text-center px-2">
                  Riot Mobile 앱 → 우측 상단 QR 아이콘 → 스캔
                </div>
                <button
                  onClick={handleReset}
                  className="text-[11px] text-[#7b8a96] hover:text-white transition-colors"
                >
                  취소
                </button>
              </div>
            ) : formState === "qr_loading" ? (
              <div className="text-[#7b8a96] text-xs text-center py-3 animate-pulse">
                QR 코드 생성 중...
              </div>
            ) : formState === "error" ? (
              <div className="flex flex-col gap-2">
                <div className="text-[#ff4655] text-[11px] text-center">{error}</div>
                <button
                  onClick={handleReset}
                  className="w-full bg-[#ff4655] text-white text-xs font-bold py-1.5 rounded"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              /* 기본 - QR 시작 버튼 */
              <div className="flex flex-col gap-2">
                <div className="text-[#7b8a96] text-[11px] text-center">
                  Riot Mobile 앱으로 안전하게 인증합니다
                </div>
                <button
                  onClick={handleStartQr}
                  className="w-full bg-[#ff4655] hover:bg-[#e03040] transition-colors text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2"
                >
                  <span>📱</span>
                  <span>Riot Mobile로 로그인</span>
                </button>
                <div className="text-[10px] text-[#7b8a96] text-center">
                  비밀번호 입력 없이 QR 코드로 연동합니다
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
