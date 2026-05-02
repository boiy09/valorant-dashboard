"use client";

import { useState, useEffect } from "react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  authorId: string;
}

export default function AnnouncePage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.json())
      .then(d => setItems(d.announcements ?? []))
      .finally(() => setLoading(false));
  }, []);

  const pinned = items.filter(i => i.pinned);
  const rest = items.filter(i => !i.pinned);

  return (
    <div>
      <div className="mb-6">
        <div className="text-[#ff4655] text-[10px] tracking-[0.2em] uppercase mb-0.5">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">공지 / 패치노트</h1>
        <p className="text-[#7b8a96] text-sm mt-0.5">서버 공지 및 발로란트 패치 정보</p>
      </div>

      {loading ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="val-card p-12 text-center text-[#7b8a96]">공지가 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {pinned.length > 0 && (
            <>
              {pinned.map(item => <AnnouncCard key={item.id} item={item} />)}
              {rest.length > 0 && <div className="border-t border-[#2a3540] my-1" />}
            </>
          )}
          {rest.map(item => <AnnouncCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function AnnouncCard({ item }: { item: Announcement }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="val-card overflow-hidden">
      <button className="w-full text-left p-5" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3">
          {item.pinned && <span className="text-[#ff4655] text-xs mt-0.5 flex-shrink-0">📌</span>}
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold">{item.title}</div>
            <div className="text-[#7b8a96] text-xs mt-1">
              {new Date(item.createdAt).toLocaleDateString("ko-KR")}
            </div>
          </div>
          <span className="text-[#7b8a96] text-xs flex-shrink-0 mt-0.5">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[#2a3540] pt-4">
          <p className="text-[#c8d3db] text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p>
        </div>
      )}
    </div>
  );
}
