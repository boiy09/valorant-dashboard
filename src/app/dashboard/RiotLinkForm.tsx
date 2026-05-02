"use client";

import { useState } from "react";

export default function RiotLinkForm({
  linked,
  currentRiotId,
}: {
  linked: boolean;
  currentRiotId: string;
}) {
  const [riotId, setRiotId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router_reload = () => window.location.reload();

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/user/riot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riotId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error);
    } else {
      router_reload();
    }
  }

  async function handleUnlink() {
    setLoading(true);
    await fetch("/api/user/riot", { method: "DELETE" });
    setLoading(false);
    router_reload();
  }

  return (
    <div className="val-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-[#ff4655] text-xs tracking-widest uppercase">라이엇 계정 연동</div>
        <div className="flex-1 h-px bg-[#2a3540]" />
        {linked && (
          <span className="flex items-center gap-1.5 text-green-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            연동됨
          </span>
        )}
      </div>

      {linked ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-bold">{currentRiotId}</div>
            <div className="text-[#7b8a96] text-xs mt-0.5">라이엇 계정이 연동되어 있습니다</div>
          </div>
          <button
            onClick={handleUnlink}
            disabled={loading}
            className="val-btn bg-[#1a242d] border border-[#2a3540] hover:border-[#ff4655] text-[#ff4655] text-sm px-5 py-2 disabled:opacity-40"
          >
            {loading ? "처리 중..." : "연동 해제"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleLink} className="flex gap-3">
          <input
            type="text"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="닉네임#태그  (예: 플레이어#KR1)"
            className="val-input flex-1 px-4 py-2.5 text-sm rounded-none"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="val-btn bg-[#ff4655] hover:bg-[#cc3644] text-white font-bold px-7 py-2.5 text-sm disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? "확인 중..." : "연동"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 text-[#ff4655] text-sm flex items-center gap-2">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
