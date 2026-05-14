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
  if (!account) return Response.json({ error: "연동된 계정 없음" });

  const tokenState = await ensureTokenState(
    account.puuid, account.accessToken, account.entitlementsToken,
    account.ssid, account.authCookie, account.tokenExpiresAt
  );
  if (!tokenState.tokens) return Response.json({ error: "토큰 갱신 실패" });

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
    Authorization: "Bearer " + accessToken,
    "X-Riot-Entitlements-JWT": entitlementsToken,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": clientVersion,
    "User-Agent": "RiotClient/" + clientVersion + " rso-auth (Windows;10;;Professional, x64)",
    Accept: "application/json",
  };
  const postHeaders = { ...headers, "Content-Type": "application/json" };
  const results: Record<string, unknown> = { puuid: account.puuid, region };

  // 1. bundle ID vs DataAssetID - valorant-api.com 양쪽 테스트
  try {
    const r = await fetch(
      "https://pd." + region + ".a.pvp.net/store/v3/storefront/" + account.puuid,
      { method: "POST", headers: postHeaders, body: "{}", signal: AbortSignal.timeout(8000) }
    );
    const parsed = await r.json() as Record<string, unknown>;
    const bundle = (parsed.FeaturedBundle as Record<string, unknown>)?.Bundle as Record<string, unknown> | undefined;
    const bundleID = bundle?.ID as string | undefined;
    const bundleDataAssetID = bundle?.DataAssetID as string | undefined;

    results.bundle_ids = { ID: bundleID, DataAssetID: bundleDataAssetID };

    for (const [label, uuid] of [["by_ID", bundleID], ["by_DataAssetID", bundleDataAssetID]] as [string, string | undefined][]) {
      if (!uuid) continue;
      const br = await fetch("https://valorant-api.com/v1/bundles/" + uuid + "?language=ko-KR").catch(() => null);
      const bBody = (await br?.text().catch(() => "")) ?? "";
      results["bundle_" + label] = { status: br?.status, ok: br?.ok, preview: bBody.slice(0, 150) };
    }
  } catch (e) {
    results.bundle_test = { error: String(e) };
  }

  // 2. contracts - BTEMilestone 구조 확인
  try {
    const r = await fetch(
      "https://pd." + region + ".a.pvp.net/contracts/v1/contracts/" + account.puuid,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const parsed = await r.json() as Record<string, unknown>;
      results.contracts = {
        activeSpecialContract: parsed.ActiveSpecialContract ?? null,
        contractCount: Array.isArray(parsed.Contracts) ? (parsed.Contracts as unknown[]).length : 0,
        bteMilestone: JSON.stringify(parsed.BTEMilestone ?? null).slice(0, 500),
        missions: JSON.stringify(parsed.Missions ?? null).slice(0, 300),
        first3Contracts: (parsed.Contracts as unknown[] ?? []).slice(0, 3).map((c) => JSON.stringify(c).slice(0, 200)),
      };
    } else {
      results.contracts = { status: r.status };
    }
  } catch (e) {
    results.contracts = { error: String(e) };
  }

  return Response.json(results);
}
