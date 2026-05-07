"use client";

import { useEffect, useState } from "react";

interface MarketPost {
  id: string;
  title: string;
  description: string;
  price: number | null;
  category: string;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null } | null;
}

const CATEGORIES = [
  ["all", "전체"],
  ["계정", "계정"],
  ["코인", "코인"],
  ["아이템", "아이템"],
  ["기타", "기타"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  sale: "거래 가능",
  reserved: "예약 중",
  sold: "거래 완료",
};

const STATUS_COLOR: Record<string, string> = {
  sale: "text-green-400",
  reserved: "text-yellow-400",
  sold: "text-[#7b8a96]",
};

export default function MarketPage() {
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market")
      .then((response) => response.json())
      .then((data) => setPosts(data.posts ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? posts : posts.filter((post) => post.category === filter);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">
          VALORANT DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-white">장터</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">
          서버 멤버 거래 게시글입니다. Discord에서 <code className="bg-[#111c24] px-1 rounded">/장터 등록</code>으로 올릴 수 있습니다.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`val-btn px-4 py-2 text-sm font-medium ${
              filter === value ? "bg-[#ff4655] text-white" : "bg-[#1a242d] text-[#7b8a96] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">게시글이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((post) => (
            <div key={post.id} className={`val-card overflow-hidden ${post.status === "sold" ? "opacity-60" : ""}`}>
              {post.imageUrl && (
                <div className="aspect-video bg-[#111c24] overflow-hidden">
                  <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded text-[#ff4655] bg-[#ff4655]/10">
                    {post.category}
                  </span>
                  <span className={`text-xs ${STATUS_COLOR[post.status] ?? "text-[#7b8a96]"}`}>
                    {STATUS_LABEL[post.status] ?? post.status}
                  </span>
                </div>
                <div className="text-white font-bold text-sm mb-1 truncate">{post.title}</div>
                <div className="text-[#7b8a96] text-xs mb-3 line-clamp-2">{post.description}</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {post.user?.image && <img src={post.user.image} alt="" className="w-5 h-5 rounded-full" />}
                    <span className="text-[#7b8a96] text-xs truncate max-w-[90px]">{post.user?.name ?? "Discord"}</span>
                  </div>
                  {post.price !== null ? (
                    <span className="text-[#ff4655] font-black text-sm">{post.price.toLocaleString()}P</span>
                  ) : (
                    <span className="text-green-400 font-bold text-sm">무료/협의</span>
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
