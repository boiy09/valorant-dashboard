"use client";

import { useState, useEffect } from "react";

interface Highlight {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  likes: number;
  agent: string | null;
  map: string | null;
  createdAt: string;
  uploader: { name: string | null; image: string | null } | null;
}

export default function HighlightPage() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/highlight")
      .then(r => r.json())
      .then(d => setHighlights(d.highlights ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function toggleLike(id: string) {
    if (liked.has(id)) return;
    const res = await fetch(`/api/highlight`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setLiked(prev => new Set(prev).add(id));
      setHighlights(prev => prev.map(h => h.id === id ? { ...h, likes: h.likes + 1 } : h));
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">하이라이트</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">서버 멤버들의 클립 모음 — Discord에서 <code className="bg-[#111c24] px-1 rounded">/하이라이트 등록</code> 으로 올려보세요</p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : highlights.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">아직 하이라이트가 없어요</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {highlights.map(h => (
            <div key={h.id} className="val-card overflow-hidden group">
              <a href={h.videoUrl} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-[#111c24] relative overflow-hidden">
                {h.thumbnailUrl ? (
                  <img src={h.thumbnailUrl} alt={h.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl opacity-30">▶</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-3xl">▶</span>
                </div>
              </a>
              <div className="p-4">
                <div className="text-white font-bold text-sm mb-2 truncate">{h.title}</div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {h.agent && <span className="text-xs text-[#7b8a96] bg-[#111c24] px-2 py-0.5 rounded">{h.agent}</span>}
                  {h.map && <span className="text-xs text-[#7b8a96] bg-[#111c24] px-2 py-0.5 rounded">{h.map}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {h.uploader?.image && <img src={h.uploader.image} alt="" className="w-5 h-5 rounded-full" />}
                    <span className="text-[#7b8a96] text-xs">{h.uploader?.name}</span>
                    <span className="text-[#7b8a96] text-xs">·</span>
                    <span className="text-[#7b8a96] text-xs">{new Date(h.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                  </div>
                  <button
                    onClick={() => toggleLike(h.id)}
                    className={`flex items-center gap-1 text-sm transition-colors ${liked.has(h.id) ? "text-[#ff4655]" : "text-[#7b8a96] hover:text-[#ff4655]"}`}>
                    <span>♥</span>
                    <span className="font-bold">{h.likes}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
