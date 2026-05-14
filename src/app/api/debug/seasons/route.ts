import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch("https://valorant-api.com/v1/seasons?language=ko-KR", { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: res.status });
  const payload = await res.json() as { data?: unknown[] };
  const all = payload.data ?? [];

  const summary = (all as Array<Record<string, unknown>>).map((s) => ({
    uuid: s.uuid,
    displayName: s.displayName,
    type: s.type,
    parentUuid: s.parentUuid,
    startTime: s.startTime,
  }));

  return NextResponse.json(summary);
}
