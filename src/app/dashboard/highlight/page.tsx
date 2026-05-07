"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/highlight")
      .then((response) => response.json())
      .then((data) => setHighlights(data.highlights ?? []))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">하이라이트</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          지정된 Discord 클립 채널에 올라온 영상이 자동으로 모입니다.
        </p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : highlights.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">아직 하이라이트가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {highlights.map((highlight) => (
            <div key={highlight.id} className="val-card overflow-hidden">
              <div className="aspect-video bg-[#111c24] relative overflow-hidden">
                <video src={highlight.url} controls preload="metadata" className="w-full h-full object-cover" />
              </div>
              <div className="p-4">
                <div className="text-white font-bold text-sm mb-3 truncate">{highlight.title}</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {highlight.user?.image && (
                      <img src={highlight.user.image} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                    )}
                    <span className="text-[#7b8a96] text-xs truncate">{highlight.user?.name ?? "Discord"}</span>
                    <span className="text-[#7b8a96] text-xs">·</span>
                    <span className="text-[#7b8a96] text-xs flex-shrink-0">
                      {new Date(highlight.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {highlight.description && (
                      <a
                        href={highlight.description}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#7b8a96] hover:text-white text-xs"
                      >
                        원본
                      </a>
                    )}
                    <button
                      onClick={() => toggleLike(highlight.id)}
                      className={`flex items-center gap-1 text-sm transition-colors ${
                        liked.has(highlight.id) ? "text-[#ff4655]" : "text-[#7b8a96] hover:text-[#ff4655]"
                      }`}
                    >
                      <span>♥</span>
                      <span className="font-bold">{highlight.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
