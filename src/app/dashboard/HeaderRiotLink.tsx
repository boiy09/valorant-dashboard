"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RiotRegion = "KR" | "AP";

interface RiotAccountItem {
  id: string;
  region: RiotRegion;
  riotId: string;
  isVerified: boolean;
}

const REGIONS: RiotRegion[] = ["KR", "AP"];

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한국 서버" : "아시아 서버";
}

export default function HeaderRiotLink() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/user/riot", { cache: "no-store" });
      const data = response.ok ? await response.json() : { accounts: [] };
      setAccounts(data.accounts ?? []);
      setError("");
    } catch {
      setError("연결된 계정을 불러오지 못했습니다.");
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshAccounts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refreshAccounts]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") refreshAccounts();
    }

    window.addEventListener("riot-accounts-updated", refreshAccounts);
    window.addEventListener("focus", refreshAccounts);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      window.removeEventListener("riot-accounts-updated", refreshAccounts);
      window.removeEventListener("focus", refreshAccounts);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [refreshAccounts]);

  const accountByRegion = useMemo(() => {
    const map = new Map<RiotRegion, RiotAccountItem>();
    for (const account of accounts) map.set(account.region, account);
    return map;
  }, [accounts]);

  const connectedCount = accounts.length;
  const summaryLabel =
    connectedCount === 0
      ? "라이엇 연동"
      : REGIONS.map((region) => `${region}:${accountByRegion.has(region) ? "연결" : "없음"}`).join(" · ");

  async function safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function handleRemove(id: string) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/user/riot", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await safeJson(response);
      if (!response.ok) {
        setError(data.error ?? "계정 해제 중 오류가 발생했습니다.");
        return;
      }
      await refreshAccounts();
      window.dispatchEvent(new Event("riot-accounts-updated"));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!initialized) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) refreshAccounts();
        }}
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
          <div className="p-3 border-b border-[#2a3540]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[#7b8a96] text-xs tracking-widest uppercase">라이엇 계정</span>
              <span className="text-[#7b8a96] text-[10px]">{connectedCount}/2 연결</span>
            </div>
            <div className="text-[#7b8a96] text-[11px]">한국 서버와 아시아 서버 계정을 각각 1개씩 연결할 수 있습니다.</div>
          </div>

          <div className="p-2 flex flex-col gap-2 border-b border-[#2a3540]">
            {REGIONS.map((region) => {
              const account = accountByRegion.get(region);
              return (
                <div key={region} className="rounded border border-[#2a3540] bg-[#0f1923] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[#ff4655] text-[10px] tracking-widest uppercase">
                        {region} · {regionLabel(region)}
                      </div>
                      <div className="text-white text-sm font-bold mt-0.5 truncate">
                        {account ? account.riotId : "아직 연결된 계정이 없습니다"}
                      </div>
                      {account && (
                        <div className={account.isVerified ? "text-[10px] text-green-400 mt-0.5" : "text-[10px] text-[#ff4655] mt-0.5"}>
                          {account.isVerified ? "인증됨" : "인증 필요"}
                        </div>
                      )}
                    </div>
                    {account && (
                      <button
                        onClick={() => handleRemove(account.id)}
                        disabled={loading}
                        className="text-[11px] text-[#7b8a96] hover:text-[#ff4655] transition-colors disabled:opacity-40 flex-shrink-0"
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3">
            {error && <div className="mb-2 text-[#ff4655] text-[10px]">{error}</div>}
            <Link
              href="/dashboard/riot-connect"
              className="block w-full text-center bg-[#ff4655] hover:bg-[#cc3644] text-white text-xs font-bold py-2 rounded transition-colors"
              onClick={() => setOpen(false)}
            >
              URL로 라이엇 계정 연동하기
            </Link>
            <div className="mt-2 text-[#7b8a96] text-[10px] leading-relaxed">
              아이디/비밀번호 로그인 방식은 사용하지 않습니다. Riot 로그인 후 주소창 URL을 붙여넣어 연결합니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
