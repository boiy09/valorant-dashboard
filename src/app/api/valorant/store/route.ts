import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTokenState } from "@/lib/rankFetcher";
import { getStore, getWallet, getBattlepass } from "@/lib/riotPrivateApi";

type RiotRegion = "KR" | "AP";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { discordId: session.user.id! },
    include: { riotAccounts: { orderBy: [{ region: "asc" }, { createdAt: "asc" }] } },
  });

  if (!user?.riotAccounts?.length) {
    return Response.json({ accounts: [] });
  }

  const results = await Promise.allSettled(
    user.riotAccounts.map(async (account) => {
      const region = account.region as RiotRegion;
      const qRegion = region === "AP" ? "ap" : "kr";

      const tokenState = await ensureTokenState(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.authCookie,
        account.tokenExpiresAt
      );

      if (!tokenState.tokens) {
        return {
          region,
          riotId: `${account.gameName}#${account.tagLine}`,
          error: "토큰이 만료되었습니다. 라이엇 연동을 다시 해주세요.",
          store: null,
          wallet: null,
          battlepass: null,
        };
      }

      const { accessToken, entitlementsToken } = tokenState.tokens;

      const [storeResult, walletResult, battlepassResult] = await Promise.allSettled([
        getStore(account.puuid, accessToken, entitlementsToken, qRegion),
        getWallet(account.puuid, accessToken, entitlementsToken, qRegion),
        getBattlepass(account.puuid, accessToken, entitlementsToken, qRegion),
      ]);

      return {
        region,
        riotId: `${account.gameName}#${account.tagLine}`,
        error: storeResult.status === "rejected"
          ? (storeResult.reason instanceof Error ? storeResult.reason.message : "상점 조회 실패")
          : null,
        store: storeResult.status === "fulfilled" ? storeResult.value : null,
        wallet: walletResult.status === "fulfilled" ? walletResult.value : null,
        battlepass: battlepassResult.status === "fulfilled" ? battlepassResult.value : null,
      };
    })
  );

  return Response.json({
    accounts: results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled")
      .map((r) => r.value),
  });
}
