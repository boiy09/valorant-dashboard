"use client";

import { Fragment, useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

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

const FORMAT_HINTS = [
  { label: "굵게", before: "**", after: "**" },
  { label: "크게", before: "[large]", after: "[/large]" },
  { label: "빨강", before: "[red]", after: "[/red]" },
  { label: "초록", before: "[green]", after: "[/green]" },
  { label: "노랑", before: "[yellow]", after: "[/yellow]" },
];

export default function AnnouncePage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>([]);
  const [krVideos, setKrVideos] = useState<VideoItem[]>([]);
  const [globalVideos, setGlobalVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinNewAnnouncement, setPinNewAnnouncement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function loadAnnouncements() {
    return fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => setItems(d.announcements ?? []))
      .catch(() => setItems([]));
  }

  useEffect(() => {
    fetch("/api/me/roles")
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));

    Promise.all([
      loadAnnouncements(),
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

  function resetWriter() {
    setTitle("");
    setContent("");
    setPinNewAnnouncement(false);
    setMessage(null);
  }

  function insertFormat(before: string, after: string) {
    const selected = "강조할 내용";
    setContent((value) => `${value}${value ? "\n" : ""}${before}${selected}${after}`);
  }

  async function submitAnnouncement() {
    if (!title.trim() || !content.trim()) {
      setMessage("제목과 내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, pinned: pinNewAnnouncement }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error ?? "공지 등록에 실패했습니다.");
        return;
      }
      resetWriter();
      setWriterOpen(false);
      await loadAnnouncements();
    } catch {
      setMessage("공지 등록 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("이 공지를 삭제할까요? 삭제 후 복구할 수 없습니다.")) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error ?? "공지 삭제에 실패했습니다.");
        return;
      }
      await loadAnnouncements();
    } finally {
      setDeletingId(null);
    }
  }

  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-[#ff4655]">VALORANT DASHBOARD</div>
          <h1 className="text-2xl font-black text-white">공지 / 패치노트</h1>
          <p className="mt-0.5 text-sm text-[#7b8a96]">서버 공지와 발로란트 공식 소식을 한 화면에서 확인합니다.</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setWriterOpen(true)}
            className="rounded bg-[#ff4655] px-4 py-2 text-xs font-black text-white shadow-lg shadow-[#ff4655]/15 transition-colors hover:bg-[#ff6471]"
          >
            공지 작성
          </button>
        ) : null}
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
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    deleting={deletingId === item.id}
                    onDelete={deleteAnnouncement}
                  />
                ))}
                {pinned.length > 0 && rest.length > 0 ? <div className="my-1 border-t border-[#2a3540]" /> : null}
                {rest.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    deleting={deletingId === item.id}
                    onDelete={deleteAnnouncement}
                  />
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
          <VideoSection title="발로란트 KR 공식 영상" description="@VALORANTkr 최신 영상 4개" videos={krVideos} loading={loading} />
          <VideoSection title="VALORANT 글로벌 공식 영상" description="@valorant 최신 영상 4개" videos={globalVideos} loading={loading} />
        </div>
      </div>

      {writerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="val-card w-full max-w-2xl p-5 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff4655]">SERVER NOTICE</div>
                <div className="mt-1 text-xl font-black text-white">공지 작성</div>
                <div className="mt-1 text-xs text-[#7b8a96]">Enter 줄바꿈을 지원합니다. 필요한 경우 아래 강조 버튼을 사용하세요.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWriterOpen(false);
                  resetWriter();
                }}
                className="rounded border border-[#2a3540] px-3 py-1.5 text-xs font-bold text-[#c8d3db] hover:border-[#ff4655] hover:text-white"
              >
                닫기
              </button>
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="공지 제목"
              maxLength={80}
              className="mb-3 w-full rounded border border-[#2a3540] bg-[#07131e] px-3 py-2 text-sm font-bold text-white outline-none transition-colors placeholder:text-[#4a5a68] focus:border-[#ff4655]"
            />

            <div className="mb-2 flex flex-wrap gap-2">
              {FORMAT_HINTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => insertFormat(item.before, item.after)}
                  className="rounded border border-[#2a3540] bg-[#0f1923] px-2.5 py-1 text-[11px] font-bold text-[#c8d3db] hover:border-[#ff4655] hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="공지 내용을 입력하세요."
              rows={8}
              maxLength={2000}
              className="w-full resize-y rounded border border-[#2a3540] bg-[#07131e] px-3 py-2 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-[#4a5a68] focus:border-[#ff4655]"
            />

            <div className="mt-3 rounded border border-[#2a3540] bg-[#07131e]/70 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#7b8a96]">미리보기</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">
                {content ? renderFormattedContent(content) : "입력한 공지가 이곳에 표시됩니다."}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-[#c8d3db]">
                <input
                  type="checkbox"
                  checked={pinNewAnnouncement}
                  onChange={(event) => setPinNewAnnouncement(event.target.checked)}
                  className="h-4 w-4 accent-[#ff4655]"
                />
                상단 고정
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#7b8a96]">{message}</span>
                <button
                  type="button"
                  onClick={submitAnnouncement}
                  disabled={saving}
                  className="rounded bg-[#ff4655] px-4 py-2 text-xs font-black text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "등록 중..." : "공지 등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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

function renderFormattedContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, lineIndex) => (
    <Fragment key={`line-${lineIndex}`}>
      {renderInlineFormat(line, `line-${lineIndex}`)}
      {lineIndex < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function renderInlineFormat(value: string, keyPrefix: string) {
  const pattern = /(\*\*[^*]+\*\*|\[(red|green|yellow|large)\][\s\S]*?\[\/\2\])/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) parts.push(value.slice(lastIndex));

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-black text-white">{part.slice(2, -2)}</strong>;
    }

    const match = part.match(/^\[(red|green|yellow|large)\]([\s\S]*)\[\/\1\]$/);
    if (!match) return <Fragment key={key}>{part}</Fragment>;

    const [, type, text] = match;
    const className =
      type === "red"
        ? "font-black text-[#ff4655]"
        : type === "green"
          ? "font-black text-emerald-400"
          : type === "yellow"
            ? "font-black text-amber-300"
            : "text-base font-black text-white";

    return <span key={key} className={className}>{text}</span>;
  });
}

function AnnouncementCard({
  item,
  isAdmin,
  deleting,
  onDelete,
}: {
  item: Announcement;
  isAdmin: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
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
          {item.pinned ? <span className="mt-0.5 flex-shrink-0 text-xs font-black text-[#ff4655]">고정</span> : null}
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
          <div className="max-h-72 overflow-y-auto pr-2 whitespace-pre-wrap text-sm leading-relaxed text-[#c8d3db]">
            {renderFormattedContent(item.content)}
          </div>
          {isAdmin ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={deleting}
                className="rounded border border-[#ff4655]/50 px-3 py-1.5 text-xs font-black text-[#ff4655] transition-colors hover:bg-[#ff4655] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
