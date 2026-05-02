"use client";

import { useState, useEffect } from "react";

interface MarketPost {
  id: string;
  title: string;
  description: string;
  price: number | null;
  type: string;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  seller: { name: string | null; image: string | null } | null;
}

export default function MarketPage() {
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [filter, setFilter] = useState<"all" | "sell" | "buy" | "free">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market")
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .finally(() => setLoading(false));
  }, []);

  const typeLabel: Record<string, string> = { sell: "판매", buy: "구매", free: "나눔" };
  const typeColor: Record<string, string> = {
    sell: "text-[#ff4655] bg-[#ff4655]/10",
    buy: "text-blue-400 bg-blue-400/10",
    free: "text-green-400 bg-green-400/10",
  };
  const statusColor: Record<string, string> = {
    open: "text-green-400",
    reserved: "text-yellow-400",
    closed: "text-[#7b8a96]",
  };
  const statusLabel: Record<string, string> = { open: "거래 가능", reserved: "예약 중", closed: "거래 완료" };

  const filtered = filter === "all" ? posts : posts.filter(p => p.type === filter);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">마켓</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">서버 멤버 간 아이템 거래 — Discord에서 <code className="bg-[#111c24] px-1 rounded">/마켓 등록</code> 으로 올려보세요</p>
      </div>

      <div className="flex gap-2 mb-6">
        {([["all", "전체"], ["sell", "판매"], ["buy", "구매"], ["free", "나눔"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`val-btn px-4 py-2 text-sm font-medium ${filter === v ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">게시글이 없어요</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(post => (
            <div key={post.id} className={`val-card overflow-hidden ${post.status === "closed" ? "opacity-60" : ""}`}>
              {post.imageUrl && (
                <div className="aspect-video bg-[#111c24] overflow-hidden">
                  <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeColor[post.type]}`}>
                    {typeLabel[post.type]}
                  </span>
                  <span className={`text-xs ${statusColor[post.status]}`}>{statusLabel[post.status]}</span>
                </div>
                <div className="text-white font-bold text-sm mb-1 truncate">{post.title}</div>
                <div className="text-[#7b8a96] text-xs mb-3 line-clamp-2">{post.description}</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {post.seller?.image && <img src={post.seller.image} alt="" className="w-5 h-5 rounded-full" />}
                    <span className="text-[#7b8a96] text-xs truncate max-w-[80px]">{post.seller?.name}</span>
                  </div>
                  {post.price !== null ? (
                    <span className="text-[#ff4655] font-black text-sm">{post.price.toLocaleString()}P</span>
                  ) : (
                    <span className="text-green-400 font-bold text-sm">무료</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
