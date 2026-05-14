import { NextRequest } from "next/server";

const ALLOWED_ORIGIN = "https://media.valorant-api.com/";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";

  if (!u.startsWith(ALLOWED_ORIGIN)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const upstream = await fetch(u, {
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new Response("Fetch failed", { status: 502 });
  }
}
