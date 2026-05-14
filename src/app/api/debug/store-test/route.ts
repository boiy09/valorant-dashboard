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

  let clientVersion = "release-09.10-shipping-9-2900357";
  try {
    const vr = await fetch("https://valorant-api.com/v1/version");
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
  };

  const postHeaders = { ...headers, "Content-Type": "application/json" };

  // 1. store v3 POST - 전체 응답 키 확인
  try {
    const r = await fetch(
      `https://pd.${region}.a.pvp.net/store/v3/storefront/${account.puuid}`,
      { method: "POST", headers: postHeaders, body: "{}", signal: AbortSignal.timeout(8000) }
    );
    const body = await r.text().catch(() => "");
    const parsed = JSON.parse(body) as Record<string, unknown>;
    results.store_v3_POST = {
      status: r.status,
      topLevelKeys: Object.keys(parsed),
      featuredBundle: JSON.stringify(parsed.FeaturedBundle ?? null).slice(0, 600),
      featuredBundles: JSON.stringify(parsed.FeaturedBundles ?? null).slice(0, 300),
      skinsPanelKeys: Object.keys((parsed.SkinsPanelLayout as Record<string, unknown>) ?? {}),
    };

    // bundle DataAssetID 추출해서 valorant-api.com 테스트
    const bundlePayload = (parsed.FeaturedBundle as Record<string, unknown>)?.Bundle as Record<string, unknown> | undefined;
    const bundleId = bundlePayload?.DataAssetID as string | undefined;
    if (bundleId) {
      const br = await fetch(`https://valorant-api.com/v1/bundles/${bundleId}?language=ko-KR`).catch(() => null);
      results.bundle_resolve = {
        bundleId,
        status: br?.status ?? "fetch failed",
        ok: br?.ok ?? false,
        bodyPreview: (await br?.text().catch(() => ""))?.slice(0, 200) ?? "",
      };
    }
  } catch (e) {
    results.store_v3_POST = { error: String(e) };
  }

  // 2. contracts (배틀패스)
  try {
    const r = await fetch(
      `https://pd.${region}.a.pvp.net/contracts/v1/contracts/${account.puuid}`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    const body = await r.text().catch(() => "");
    if (r.ok) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      results.contracts = {
        status: r.status,
        topLevelKeys: Object.keys(parsed),
        activeSpecialContract: parsed.ActiveSpecialContract ?? null,
        contractCount: Array.isArray(parsed.Contracts) ? (parsed.Contracts as unknown[]).length : 0,
        firstContract: JSON.stringify((parsed.Contracts as unknown[])?.[0]).slice(0, 300),
      };
    } else {
      results.contracts = { status: r.status, bodyPreview: body.slice(0, 200) };
    }
  } catch (e) {
    results.contracts = { error: String(e) };
  }

  return Response.json(results);
}
