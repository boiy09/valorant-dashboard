"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type RiotRegion = "KR" | "AP";
type FormState = "idle" | "loading" | "mfa" | "success";

interface RiotAccountItem {
  id: string;
  region: RiotRegion;
  riotId: string;
  isVerified: boolean;
}

const REGIONS: RiotRegion[] = ["KR", "AP"];

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한섭" : "아섭";
}

export default function HeaderRiotLink() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pendingCookies, setPendingCookies] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/user/riot")
      .then((r) => (r.ok ? r.json() : { linked: false, accounts: [] }))
      .then((data: { accounts?: RiotAccountItem[] }) => {
        setAccounts(data.accounts ?? []);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

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

  async function safeJson(r: Response) {
    try { return await r.json(); } catch { return {}; }
  }

  function resetForm() {
    setUsername("");
    setPassword("");
    setMfaCode("");
    setPendingCookies("");
    setFormState("idle");
    setError("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormState("loading");
    setError("");

    try {
      const res = await fetch("/api/user/riot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        setError(data.error ?? "라이엇 계정 연결 중 오류가 발생했습니다.");
        setFormState("idle");
      } else if (data.mfa) {
        setPendingCookies(data.pendingCookies ?? "");
        setFormState("mfa");
      } else {
        setAccounts((prev) => [
          ...prev.filter((a) => a.region !== data.account.region),
          data.account,
        ]);
        resetForm();
        setFormState("success");
        setTimeout(() => setFormState("idle"), 2000);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setFormState("idle");
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setFormState("loading");
    setError("");

    try {
      const res = await fetch("/api/riot/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode, pendingCookies }),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        setError(data.error ?? "인증 코드 확인 중 오류가 발생했습니다.");
        setFormState("mfa");
      } else {
        setAccounts((prev) => [
          ...prev.filter((a) => a.region !== data.account.region),
          data.account,
        ]);
        resetForm();
        setFormState("success");
        setTimeout(() => setFormState("idle"), 2000);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setFormState("mfa");
    }
  }

  async function handleRemove(id: string) {
    setError("");
    try {
      const res = await fetch("/api/user/riot", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error ?? "계정 해제 중 오류가 발생했습니다.");
      } else {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    }
  }

  if (!initialized) return null;

  const isLoading = formState === "loading";

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
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connectedCount > 0 ? "bg-green-400" : "bg-[#ff4655]"}`} />
        <span className={`truncate max-w-[180px] ${connectedCount > 0 ? "text-green-400 font-medium" : ""}`}>
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
            <div className="text-[#7b8a96] text-[11px]">한섭(KR)과 아섭(AP) 계정을 각각 1개씩 연결할 수 있습니다.</div>
          </div>

          {/* 계정 목록 */}
          <div className="p-2 flex flex-col gap-2 border-b border-[#2a3540]">
            {REGIONS.map((key) => {
              const account = accountByRegion.get(key);
              return (
                <div key={key} className="rounded border border-[#2a3540] bg-[#0f1923] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[#ff4655] text-[10px] tracking-widest uppercase">{key} · {regionLabel(key)}</div>
                      <div className="text-white text-sm font-bold mt-0.5">
                        {account ? account.riotId : "아직 연결된 계정이 없습니다"}
                      </div>
                      {account && (
                        <div className="mt-0.5">
                          {account.isVerified
                            ? <span className="text-[10px] text-green-400">인증됨</span>
                            : <span className="text-[10px] text-[#ff4655]">인증 필요</span>}
                        </div>
                      )}
                    </div>
                    {account && (
                      <button
                        onClick={() => handleRemove(account.id)}
                        disabled={isLoading}
                        className="text-[11px] text-[#7b8a96] hover:text-[#ff4655] transition-colors disabled:opacity-40"
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 폼 */}
          <div className="p-3">
            {formState === "success" ? (
              <div className="text-green-400 text-xs text-center py-2">계정이 연결되었습니다!</div>
            ) : formState === "mfa" || (isLoading && pendingCookies) ? (
              <>
                <div className="text-[#7b8a96] text-[10px] mb-1">이메일 또는 인증 앱의 6자리 코드를 입력하세요</div>
                <form onSubmit={handleMfa} className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    required
                    className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] w-full tracking-widest text-center"
                  />
                  {error && <div className="text-[#ff4655] text-[10px]">{error}</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={resetForm} disabled={isLoading}
                      className="flex-1 text-[#7b8a96] text-xs py-1.5 rounded border border-[#2a3540] disabled:opacity-50">
                      취소
                    </button>
                    <button type="submit" disabled={isLoading || mfaCode.length < 6}
                      className="flex-1 bg-[#ff4655] text-white text-xs font-bold py-1.5 rounded disabled:opacity-50">
                      {isLoading ? "확인 중..." : "확인"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="text-[#7b8a96] text-[10px] mb-2">계정 추가 — 비밀번호는 저장되지 않습니다</div>
                <form onSubmit={handleAdd} className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="라이엇 아이디"
                    autoComplete="username"
                    required
                    className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] w-full"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    autoComplete="current-password"
                    required
                    className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] w-full"
                  />
                  {error && <div className="text-[#ff4655] text-[10px]">{error}</div>}
                  <button type="submit" disabled={isLoading}
                    className="bg-[#ff4655] text-white text-xs font-bold py-1.5 rounded disabled:opacity-50">
                    {isLoading ? "로그인 중..." : "연동하기"}
                  </button>
                </form>
                <div className="mt-2 pt-2 border-t border-[#2a3540]">
                  <Link
                    href="/dashboard/riot-connect"
                    className="flex items-center justify-center gap-1.5 text-[#7b8a96] hover:text-[#ff4655] text-[10px] transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <span>🔑</span>
                    <span>비밀번호 없이 URL로 연동하기</span>
                    <span>→</span>
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
