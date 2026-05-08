"use client";

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  authorId: string;
}

interface PatchNote {
  title: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
  description: string | null;
}

interface VideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
}

export default function AnnouncePage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>([]);
  const [krVideos, setKrVideos] = useState<VideoItem[]>([]);
  const [globalVideos, setGlobalVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/announcements")
        .then((r) => r.json())
        .then((d) => setItems(d.announcements ?? []))
        .catch(() => setItems([])),
      fetch("/api/valorant/news")
        .then((r) => r.json())
        .then((d) => setPatchNotes(d.patchNotes ?? []))
        .catch(() => setPatchNotes([])),
      fetch("/api/youtube/latest?channel=kr")
        .then((r) => r.json())
        .then((d) => setKrVideos(d.videos ?? []))
        .catch(() => setKrVideos([])),
      fetch("/api/youtube/latest?channel=global")
        .then((r) => r.json())
        .then((d) => setGlobalVideos(d.videos ?? []))
        .catch(() => setGlobalVideos([])),
    ]).finally(() => setLoading(false));
  }, []);

  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">VALORANT DASHBOARD</div>
        <h1 className="text-2xl font-black text-white">공지 / 패치노트</h1>
        <p className="mt-0.5 text-sm text-[#7b8a96]">서버 공지와 발로란트 공식 소식을 한 화면에서 확인합니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="grid min-w-0 grid-rows-2 gap-5">
          <section className="min-h-[360px]">
            <SectionHeader eyebrow="SERVER NOTICE" title="서버 공지" description="운영진이 등록한 서버 공지입니다." />
            {loading ? (
              <EmptyCard text="공지 불러오는 중..." />
            ) : items.length === 0 ? (
              <EmptyCard text="등록된 공지가 없습니다." />
            ) : (
              <div className="flex max-h-[430px] flex-col gap-3 overflow-y-auto pr-1">
                {pinned.map((item) => (
                  <AnnouncementCard key={item.id} item={item} />
                ))}
                {pinned.length > 0 && rest.length > 0 ? <div className="my-1 border-t border-[#2a3540]" /> : null}
                {rest.map((item) => (
                  <AnnouncementCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          <section className="min-h-[360px]">
            <SectionHeader
              eyebrow="OFFICIAL PATCH"
              title="발로란트 패치 노트"
              description="playvalorant.com 최신 패치노트 4개"
            />
            <NewsGrid items={patchNotes} loading={loading} />
          </section>
        </div>

        <div className="grid min-w-0 grid-rows-2 gap-5">
          <VideoSection
            title="발로란트 KR 공식 영상"
            description="@VALORANTkr 최신 영상 4개"
            videos={krVideos}
            loading={loading}
          />
          <VideoSection
            title="VALORANT 글로벌 공식 영상"
            description="@valorant 최신 영상 4개"
            videos={globalVideos}
            loading={loading}
          />
        </div>
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

function EmptyCard({ text }: { text: string }) {
  return <div className="val-card flex min-h-[260px] items-center justify-center p-8 text-center text-sm text-[#7b8a96]">{text}</div>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function NewsGrid({ items, loading }: { items: PatchNote[]; loading: boolean }) {
  if (loading) return <EmptyCard text="패치노트 불러오는 중..." />;
  if (!items.length) return <EmptyCard text="패치노트를 불러오지 못했습니다." />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group val-card overflow-hidden transition-colors hover:border-[#ff4655]/70"
        >
          <div className="aspect-video bg-[#101c26]">
            {item.image ? <img src={item.image} alt={item.title} className="h-full w-full object-cover" /> : null}
          </div>
          <div className="p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#ff4655]">{formatDate(item.publishedAt)}</div>
            <div className="mt-1 line-clamp-2 text-sm font-black text-white group-hover:text-[#ff4655]">{item.title}</div>
            {item.description ? <div className="mt-1 line-clamp-2 text-xs text-[#8da0ad]">{item.description}</div> : null}
          </div>
        </a>
      ))}
    </div>
  );
}

function VideoSection({
  title,
  description,
  videos,
  loading,
}: {
  title: string;
  description: string;
  videos: VideoItem[];
  loading: boolean;
}) {
  return (
    <section className="min-h-[360px]">
      <SectionHeader eyebrow="OFFICIAL VIDEO" title={title} description={description} />
      {loading ? (
        <EmptyCard text="영상 불러오는 중..." />
      ) : videos.length === 0 ? (
        <EmptyCard text="영상을 불러오지 못했습니다." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {videos.map((video) => (
            <a
              key={video.id}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group val-card overflow-hidden transition-colors hover:border-[#ff4655]/70"
            >
              <div className="relative aspect-video bg-black">
                <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 text-3xl font-black text-white/90">
                  ▶
                </span>
              </div>
              <div className="p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#ff4655]">{formatDate(video.publishedAt)}</div>
                <div className="mt-1 line-clamp-2 text-sm font-black text-white group-hover:text-[#ff4655]">{video.title}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyId(event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) {
    event.stopPropagation();
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="val-card overflow-hidden">
      <button className="w-full p-5 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-start gap-3">
          {item.pinned ? <span className="mt-0.5 flex-shrink-0 text-xs text-[#ff4655]">고정</span> : null}
          <div className="min-w-0 flex-1">
            <div className="font-bold text-white">{item.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#7b8a96]">
              <span>{formatDate(item.createdAt)}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={copyId}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    copyId(event);
                  }
                }}
                title="공지 ID 복사"
                className="cursor-copy rounded border border-[#2a3540] bg-[#0f1923] px-1.5 py-0.5 font-mono text-[10px] text-[#c8d3db] transition-colors hover:border-[#ff4655] hover:text-white"
              >
                ID: {copied ? "복사됨" : item.id}
              </span>
            </div>
          </div>
          <span className="mt-0.5 flex-shrink-0 text-xs text-[#7b8a96]">{open ? "접기" : "보기"}</span>
        </div>
      </button>
      {open ? (
        <div className="border-t border-[#2a3540] px-5 pb-5 pt-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">{item.content}</p>
        </div>
      ) : null}
    </div>
  );
}
