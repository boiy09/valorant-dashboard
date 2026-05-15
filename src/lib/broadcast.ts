const PROXY_URL = process.env.RIOT_AUTH_PROXY_URL;
const PROXY_SECRET = process.env.RIOT_AUTH_PROXY_SECRET;

export async function broadcast(type: string, data: Record<string, unknown> = {}) {
  if (!PROXY_URL || !PROXY_SECRET) return;
  try {
    await fetch(`${PROXY_URL}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proxy-secret": PROXY_SECRET },
      body: JSON.stringify({ type, data }),
    });
  } catch {
    // 브로드캐스트 실패는 무시 (실시간 기능은 부가 기능)
  }
}
