"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/hooks/useRealtime";

interface Highlight {
  id: string;
  title: string;
  description: string | null;
  url: string;
  likes: number;
  createdAt: string;
  user: { name: string | null; image: string | null } | null;
}

export default function HighlightPage() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchHighlights = useCallback(() => {
    Promise.all([
      fetch("/api/highlight").then((response) => response.json()),
      fetch("/api/me/roles").then((response) => response.json()).catch(() => ({ isAdmin: false })),
    ])
      .then(([highlightData, roleData]) => {
        setHighlights(highlightData.highlights ?? []);
        setIsAdmin(Boolean(roleData.isAdmin));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchHighlights(); }, [fetchHighlights]);

  useRealtime("highlight", () => fetchHighlights());

  async function toggleLike(id: string) {
    if (liked.has(id)) return;

    const response = await fetch("/api/highlight", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (response.ok) {
      setLiked((previous) => new Set(previous).add(id));
      setHighlights((previous) =>
        previous.map((highlight) =>
          highlight.id === id ? { ...highlight, likes: highlight.likes + 1 } : highlight
        )
      );
    }
  }

  async function deleteHighlight(id: string) {
    if (!isAdmin || deletingId) return;
    const confirmed = window.confirm("이 하이라이트를 삭제할까요?");
    if (!confirmed) return;

    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/highlight?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "하이라이트 삭제에 실패했습니다.");

      setHighlights((current) => current.filter((highlight) => highlight.id !== id));
      setMessage("하이라이트를 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "하이라이트 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">하이라이트</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">
          지정된 Discord 클립 채널에 올라온 영상을 확인합니다. 삭제된 Discord 영상은 자동으로 정리됩니다.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded border border-[#2a3540] bg-[#111c24] px-4 py-3 text-sm font-bold text-[#c8d3db]">
          {message}
        </div>
      )}

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">불러오는 중...</div>
      ) : highlights.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">아직 하이라이트가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((highlight) => (
            <article key={highlight.id} className="val-card overflow-hidden">
              <div className="relative aspect-video overflow-hidden bg-[#111c24]">
                <video src={highlight.url} controls preload="metadata" className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <div className="mb-3 truncate text-sm font-black text-white">{highlight.title}</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {highlight.user?.image && (
                      <img src={highlight.user.image} alt="" className="h-5 w-5 flex-shrink-0 rounded-full" />
                    )}
                    <span className="truncate text-xs text-[#7b8a96]">{highlight.user?.name ?? "Discord"}</span>
                    <span className="text-xs text-[#7b8a96]">·</span>
                    <span className="flex-shrink-0 text-xs text-[#7b8a96]">
                      {new Date(highlight.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {highlight.description && (
                      <a
                        href={highlight.description}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#7b8a96] hover:text-white"
                      >
                        원본
                      </a>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteHighlight(highlight.id)}
                        disabled={deletingId === highlight.id}
                        className="text-xs font-bold text-[#ff8a95] hover:text-white disabled:opacity-50"
                      >
                        {deletingId === highlight.id ? "삭제 중" : "삭제"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleLike(highlight.id)}
                      className={`flex items-center gap-1 text-sm transition-colors ${
                        liked.has(highlight.id) ? "text-[#ff4655]" : "text-[#7b8a96] hover:text-[#ff4655]"
                      }`}
                    >
                      <span>좋아요</span>
                      <span className="font-bold">{highlight.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
