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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section className="min-w-0">
          <SectionHeader eyebrow="SERVER NOTICE" title="서버 공지" description="운영진이 등록한 서버 공지를 확인합니다." />

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
        </section>

        <aside className="grid gap-5">
          <section>
            <SectionHeader eyebrow="OFFICIAL PATCH" title="발로란트 패치 노트" description="공식 패치노트 바로가기" />
            <div className="val-card overflow-hidden">
              <div className="border-b border-[#2a3540] bg-[#142431] p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff4655]">Riot Games Official</div>
                <h2 className="mt-2 text-xl font-black text-white">최신 패치 노트 확인</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#9aa8b3]">
                  요원 밸런스, 맵 로테이션, 경쟁전 변경사항은 공식 패치노트에서 가장 정확하게 확인할 수 있습니다.
                </p>
              </div>
              <div className="grid gap-2 p-4">
                <OfficialLink
                  href="https://playvalorant.com/ko-kr/news/tags/patch-notes/"
                  label="한국어 패치노트 보기"
                  description="playvalorant.com 공식 뉴스"
                />
                <OfficialLink
                  href="https://playvalorant.com/en-us/news/tags/patch-notes/"
                  label="영문 패치노트 보기"
                  description="한국어 페이지 갱신이 늦을 때 확인"
                />
              </div>
            </div>
          </section>

          <section>
            <SectionHeader eyebrow="OFFICIAL VIDEO" title="발로란트 공식 유튜브" description="공식 영상 플레이리스트" />
            <div className="val-card overflow-hidden">
              <div className="aspect-video bg-black">
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube.com/embed/videoseries?list=UU8CX0LD98EDXl4UYX1MDCXg"
                  title="VALORANT official YouTube uploads"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="p-4">
                <OfficialLink
                  href="https://www.youtube.com/@VALORANT"
                  label="공식 채널에서 보기"
                  description="트레일러, 개발자 영상, 신규 요원 영상"
                />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff4655]">{eyebrow}</div>
      <div className="mt-1 text-lg font-black text-white">{title}</div>
      <div className="mt-0.5 text-xs text-[#7b8a96]">{description}</div>
    </div>
  );
}

function OfficialLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded border border-[#2a3540] bg-[#0f1923] px-4 py-3 transition-colors hover:border-[#ff4655]/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white group-hover:text-[#ff4655]">{label}</div>
          <div className="mt-0.5 text-xs text-[#7b8a96]">{description}</div>
        </div>
        <span className="text-[#ff4655]">↗</span>
      </div>
    </a>
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
