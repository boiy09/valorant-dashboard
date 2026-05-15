import { NextRequest } from "next/server";

export const maxDuration = 30;

const PROXY_URL = process.env.RIOT_AUTH_PROXY_URL;
const PROXY_SECRET = process.env.RIOT_AUTH_PROXY_SECRET;

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since") ?? "0";

  if (!PROXY_URL) return Response.json({ events: [], lastId: 0 });

  try {
    const res = await fetch(`${PROXY_URL}/events?since=${since}`, {
      headers: { "x-proxy-secret": PROXY_SECRET ?? "" },
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) return Response.json({ events: [], lastId: 0 });
    return Response.json(await res.json());
  } catch {
    return Response.json({ events: [], lastId: 0 });
  }
}
