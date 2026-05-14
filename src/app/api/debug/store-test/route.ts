import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTokenState } from "@/lib/rankFetcher";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인 필요" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { discordId: session.user.id! },
    include: { riotAccounts: { orderBy: [{ createdAt: "asc" }], take: 1 } },
  });

  const account = user?.riotAccounts?.[0];
  if (!account) {
    return Response.json({ error: "연동된 계정 없음" });
  }

  const tokenState = await ensureTokenState(
    account.puuid,
    account.accessToken,
    account.entitlementsToken,
    account.ssid,
    account.authCookie,
    account.tokenExpiresAt
  );

  if (!tokenState.tokens) {
    return Response.json({ error: "토큰 갱신 실패", reason: tokenState.reason, message: tokenState.message });
  }

  const { accessToken, entitlementsToken } = tokenState.tokens;
  const region = account.region.toLowerCase();

  const VERSION_URL = "https://valorant-api.com/v1/version";
  let clientVersion = "release-09.10-shipping-9-2900357";
  try {
    const vr = await fetch(VERSION_URL);
    if (vr.ok) {
      const vd = await vr.json() as { data?: { riotClientVersion?: string } };
      clientVersion = vd.data?.riotClientVersion ?? clientVersion;
    }
  } catch { /* fallback */ }

  const CLIENT_PLATFORM = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "X-Riot-Entitlements-JWT": entitlementsToken,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": clientVersion,
    "User-Agent": `RiotClient/${clientVersion} rso-auth (Windows;10;;Professional, x64)`,
    Accept: "application/json",
  };

  const results: Record<string, unknown> = {
    puuid: account.puuid,
    region,
    clientVersion,
    tokenExpiresAt: account.tokenExpiresAt,
    hasSsid: Boolean(account.ssid),
    hasAuthCookie: Boolean(account.authCookie),
  };

  const postHeaders = { ...headers, "Content-Type": "application/json" };

  const endpoints: Array<{ key: string; url: string; method?: string }> = [
    { key: "wallet_v1_GET", url: `https://pd.${region}.a.pvp.net/store/v1/wallet/${account.puuid}` },
    { key: "store_v2_GET", url: `https://pd.${region}.a.pvp.net/store/v2/storefront/${account.puuid}` },
    { key: "store_v3_GET", url: `https://pd.${region}.a.pvp.net/store/v3/storefront/${account.puuid}` },
    { key: "store_v3_POST", url: `https://pd.${region}.a.pvp.net/store/v3/storefront/${account.puuid}`, method: "POST" },
  ];

  for (const ep of endpoints) {
    try {
      const init: RequestInit = ep.method === "POST"
        ? { method: "POST", headers: postHeaders, body: "{}", signal: AbortSignal.timeout(8000) }
        : { headers, signal: AbortSignal.timeout(8000) };
      const r = await fetch(ep.url, init);
      const body = await r.text().catch(() => "");
      results[ep.key] = {
        status: r.status,
        ok: r.ok,
        bodyPreview: body.slice(0, 400),
      };
    } catch (e) {
      results[ep.key] = { error: String(e) };
    }
  }

  return Response.json(results);
}
