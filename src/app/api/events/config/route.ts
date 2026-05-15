const PROXY_URL = process.env.RIOT_AUTH_PROXY_URL;

function toWebSocketUrl(value: string) {
  if (value.startsWith("https://")) return value.replace(/^https:\/\//, "wss://");
  if (value.startsWith("http://")) return value.replace(/^http:\/\//, "ws://");
  return value;
}

export async function GET() {
  return Response.json({
    wsUrl: PROXY_URL ? toWebSocketUrl(PROXY_URL) : null,
  });
}
