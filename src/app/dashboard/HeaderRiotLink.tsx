"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RiotRegion = "KR" | "AP";

interface RiotAccountItem {
  id: string;
  region: RiotRegion;
  riotId: string;
}

const REGIONS: RiotRegion[] = ["KR", "AP"];

function regionLabel(region: RiotRegion) {
  return region === "KR" ? "한섭" : "아섭";
}

export default function HeaderRiotLink() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [region, setRegion] = useState<RiotRegion>("KR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/user/riot")
      .then((response) => (response.ok ? response.json() : { linked: false, accounts: [] }))
      .then((data) => {
        setAccounts(data.accounts ?? []);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const accountByRegion = useMemo(() => {
    const map = new Map<RiotRegion, RiotAccountItem>();
    for (const account of accounts) {
      map.set(account.region, account);
    }
    return map;
  }, [accounts]);

  const connectedCount = accounts.length;
  const summaryLabel =
    connectedCount === 0
      ? "라이엇 연동"
      : REGIONS.map((key) => {
          const account = accountByRegion.get(key);
          return `${key}:${account ? "연결됨" : "비어 있음"}`;
        }).join(" · ");

  async function safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/user/riot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId: input, region }),
      });
      const data = await safeJson(response);

      if (!response.ok) {
        setError(data.error ?? "라이엇 계정 연결 중 오류가 발생했습니다.");
      } else {
        setAccounts((prev) => [
          ...prev.filter((account) => account.region !== data.account.region),
          data.account,
        ]);
        setInput("");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
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
      } else {
        setAccounts((prev) => prev.filter((account) => account.id !== id));
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!initialized) return null;

  const regionDisabled = Boolean(accountByRegion.get(region));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
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
        <span className={`truncate max-w-[170px] ${connectedCount > 0 ? "text-green-400 font-medium" : ""}`}>
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
            <div className="text-[#7b8a96] text-[11px]">
              디스코드 계정당 한섭(KR)과 아섭(AP) 계정을 각각 1개씩 연결할 수 있습니다.
            </div>
          </div>

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
                    </div>
                    {account && (
                      <button
                        onClick={() => handleRemove(account.id)}
                        disabled={loading}
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

          <div className="p-3">
            <div className="text-[#7b8a96] text-[10px] mb-2">계정 추가</div>
            <form onSubmit={handleAdd} className="flex flex-col gap-2">
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value as RiotRegion)}
                  className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655]"
                >
                  <option value="KR">KR · 한섭</option>
                  <option value="AP">AP · 아섭</option>
                </select>
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="예: Player#KR1"
                  className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] w-full"
                  required
                />
              </div>
              {regionDisabled && (
                <div className="text-[#7b8a96] text-[10px]">
                  선택한 지역에는 이미 계정이 연결되어 있습니다. 먼저 해제한 뒤 다시 연결해 주세요.
                </div>
              )}
              {error && <div className="text-[#ff4655] text-[10px]">{error}</div>}
              <button
                type="submit"
                disabled={loading || regionDisabled}
                className="bg-[#ff4655] text-white text-xs font-bold py-1.5 rounded disabled:opacity-50"
              >
                {loading ? "확인 중..." : "연동하기"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
