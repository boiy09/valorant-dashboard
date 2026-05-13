import { NextResponse } from "next/server";

interface PatchNote {
  title: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
  description: string | null;
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }

  const record = value as Record<string, unknown>;
  visit(record);
  for (const item of Object.values(record)) walk(item, visit);
}

function stripHtml(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim() : null;
}

function getImage(record: Record<string, unknown>) {
  const media = record.media as Record<string, unknown> | undefined;
  const imageMedia = record.imageMedia as Record<string, unknown> | undefined;
  return typeof imageMedia?.url === "string"
    ? imageMedia.url
    : typeof media?.url === "string"
      ? media.url
      : null;
}

export async function GET() {
  try {
    const response = await fetch("https://playvalorant.com/ko-kr/news/tags/patch-notes/", {
      next: { revalidate: 60 * 30 },
      headers: { "user-agent": "valorant-dashboard/1.0" },
    });
    const html = await response.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match?.[1]) return NextResponse.json({ patchNotes: [] });

    const payload = JSON.parse(match[1]);
    const seen = new Set<string>();
    const patchNotes: PatchNote[] = [];

    walk(payload, (record) => {
      const title = typeof record.title === "string" ? record.title : "";
      const publishedAt = typeof record.publishedAt === "string" ? record.publishedAt : null;
      const action = record.action as Record<string, unknown> | undefined;
      const actionPayload = action?.payload as Record<string, unknown> | undefined;
      const url = typeof actionPayload?.url === "string" ? actionPayload.url : "";
      if (!title.includes("패치") || !url.includes("/news/")) return;

      const absoluteUrl = url.startsWith("http") ? url : `https://playvalorant.com${url}`;
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      const descriptionRecord = record.description as Record<string, unknown> | undefined;
      patchNotes.push({
        title,
        url: absoluteUrl,
        image: getImage(record),
        publishedAt,
        description: stripHtml(descriptionRecord?.body),
      });
    });

    patchNotes.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    return NextResponse.json({ patchNotes: patchNotes.slice(0, 4) });
  } catch (e) {
    console.error("[valorant/news] 패치노트 스크래핑 실패:", e);
    return NextResponse.json({ patchNotes: [] });
  }
}
