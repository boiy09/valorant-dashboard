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

    // valorant-api.com API 엔드포인트 테스트
    for (const [label, uuid] of [["by_ID", bundleID], ["by_DataAssetID", bundleDataAssetID]] as [string, string | undefined][]) {
      if (!uuid) continue;
      const br = await fetch("https://valorant-api.com/v1/bundles/" + uuid + "?language=ko-KR").catch(() => null);
      const bBody = (await br?.text().catch(() => "")) ?? "";
      results["bundle_api_" + label] = { status: br?.status, ok: br?.ok, preview: bBody.slice(0, 150) };
    }

    // CDN GET 테스트 (HEAD는 405를 반환 — GET으로 실제 존재 확인)
    for (const [label, uuid] of [["DataAssetID", bundleDataAssetID], ["ID", bundleID]] as [string, string | undefined][]) {
      if (!uuid) continue;
      for (const filename of ["displayicon.png", "displayicon2.png", "verticalpromoimage.png"]) {
        const cdnUrl = `https://media.valorant-api.com/bundles/${uuid}/${filename}`;
        const cr = await fetch(cdnUrl, {
          headers: { "Range": "bytes=0-0" },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        results[`bundle_cdn_GET_${label}_${filename.replace(".png", "")}`] = {
          url: cdnUrl,
          status: cr?.status,
          ok: cr?.ok,
          contentType: cr?.headers.get("Content-Type"),
        };
      }
    }

    // Items 실제 구조 확인 (스킨 아이콘 폴백이 작동하는지 진단)
    const items = bundle?.Items as unknown[] | undefined;
    results.bundle_items_count = items?.length ?? 0;
    results.bundle_items_first3 = (items ?? []).slice(0, 3).map((i) => JSON.stringify(i).slice(0, 200));
    results.bundle_item_offers_first = JSON.stringify((bundle?.ItemOffers as unknown[])?.[0] ?? null).slice(0, 300);

    // FeaturedBundles 구조 확인
    const featuredBundles = (parsed.FeaturedBundles as Record<string, unknown>)?.Bundles as unknown[] | undefined;
    results.bundle_raw_keys = bundle ? Object.keys(bundle) : [];
    results.featured_bundles_count = featuredBundles?.length ?? 0;
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
