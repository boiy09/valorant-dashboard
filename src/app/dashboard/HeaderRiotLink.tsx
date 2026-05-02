"use client";

import { useEffect, useRef, useState } from "react";

interface RiotAccountItem {
  id: string;
  riotId: string;
  isPrimary: boolean;
}

const MAX = 5;

export default function HeaderRiotLink() {
  const [accounts, setAccounts] = useState<RiotAccountItem[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
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
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        body: JSON.stringify({ riotId: input }),
      });
      const data = await safeJson(response);

      if (!response.ok) {
        setError(data.error ?? "연동 중 오류가 발생했어요.");
      } else {
        setAccounts((prev) => [...prev, data.account]);
        setInput("");
        setError("");
      }
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    setLoading(true);

    try {
      await fetch("/api/user/riot", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}

    setLoading(false);
    setAccounts((prev) => {
      const next = prev.filter((account) => account.id !== id);
      const wasPrimary = prev.find((account) => account.id === id)?.isPrimary;

      if (wasPrimary && next.length > 0) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  async function handleSetPrimary(id: string) {
    setLoading(true);

    try {
      await fetch("/api/user/riot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setAccounts((prev) => prev.map((account) => ({ ...account, isPrimary: account.id === id })));
    } catch {}

    setLoading(false);
  }

  if (!initialized) return null;

  const primary = accounts.find((account) => account.isPrimary);
  const hasAccounts = accounts.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded transition-colors ${
          hasAccounts
            ? "border-[#2a3540] hover:border-[#ff4655]/50"
            : "border-[#ff4655]/40 hover:border-[#ff4655] text-[#ff4655]"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasAccounts ? "bg-green-400" : "bg-[#ff4655]"}`} />
        <span className={`truncate max-w-[110px] ${hasAccounts ? "text-green-400 font-medium" : ""}`}>
          {primary ? primary.riotId : "라이엇 연동"}
        </span>
        {accounts.length > 1 && <span className="text-[#7b8a96] text-[10px]">+{accounts.length - 1}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-[#111c24] border border-[#2a3540] rounded shadow-xl z-50 w-72">
          <div className="p-3 border-b border-[#2a3540]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[#7b8a96] text-xs tracking-widest uppercase">라이엇 계정</span>
              <span className="text-[#7b8a96] text-[10px]">
                {accounts.length}/{MAX}
              </span>
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="p-2 flex flex-col gap-1 border-b border-[#2a3540]">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                    account.isPrimary ? "bg-[#ff4655]/10" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      account.isPrimary ? "bg-[#ff4655]" : "bg-[#2a3540]"
                    }`}
                  />
                  <span
                    className={`flex-1 text-xs truncate ${
                      account.isPrimary ? "text-white font-bold" : "text-[#7b8a96]"
                    }`}
                  >
                    {account.riotId}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!account.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(account.id)}
                        disabled={loading}
                        title="대표 계정으로 설정"
                        className="text-[10px] text-[#7b8a96] hover:text-[#ff4655] transition-colors disabled:opacity-40 px-1"
                      >
                        대표
                      </button>
                    )}
                    {account.isPrimary && (
                      <span className="text-[10px] text-[#ff4655] px-1" title="대표 계정">
                        대표
                      </span>
                    )}
                    <button
                      onClick={() => handleRemove(account.id)}
                      disabled={loading}
                      title="연동 해제"
                      className="text-[10px] text-[#7b8a96] hover:text-[#ff4655] transition-colors disabled:opacity-40 px-1"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {accounts.length < MAX ? (
            <div className="p-3">
              <div className="text-[#7b8a96] text-[10px] mb-2">계정 추가</div>
              <form onSubmit={handleAdd} className="flex flex-col gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="닉네임#태그 (예: Player#KR1)"
                  className="px-3 py-2 text-xs text-white bg-[#0f1923] border border-[#2a3540] rounded focus:outline-none focus:border-[#ff4655] w-full"
                  required
                />
                {error && <div className="text-[#ff4655] text-[10px]">{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#ff4655] text-white text-xs font-bold py-1.5 rounded disabled:opacity-50"
                >
                  {loading ? "확인 중..." : "연동하기"}
                </button>
              </form>
            </div>
          ) : (
            <div className="p-3 text-center text-[#7b8a96] text-xs">
              최대 {MAX}개 계정까지 연동 가능해요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
