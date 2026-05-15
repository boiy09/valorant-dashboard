import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureValidTokens } from "@/lib/rankFetcher";
import { getPlayerPresence } from "@/lib/riotPrivateApi";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const puuids = req.nextUrl.searchParams.get("puuids")?.split(",").filter(Boolean) ?? [];
  if (puuids.length === 0) return Response.json({ presences: {} });

  const accounts = await prisma.riotAccount.findMany({
    where: { puuid: { in: puuids } },
    select: {
      puuid: true,
      region: true,
      accessToken: true,
      entitlementsToken: true,
      ssid: true,
      authCookie: true,
      tokenExpiresAt: true,
    },
  });

  const presences: Record<string, { inGame: boolean; inPreGame: boolean; matchId: string | null }> = {};

  await Promise.allSettled(
    accounts.map(async (account) => {
      const tokens = await ensureValidTokens(
        account.puuid,
        account.accessToken,
        account.entitlementsToken,
        account.ssid,
        account.authCookie,
        account.tokenExpiresAt
      );
      if (!tokens) {
        presences[account.puuid] = { inGame: false, inPreGame: false, matchId: null };
        return;
      }
      const presence = await getPlayerPresence(account.puuid, account.region, tokens.accessToken, tokens.entitlementsToken);
      presences[account.puuid] = {
        inGame: presence.inCoreGame,
        inPreGame: presence.inPreGame,
        matchId: presence.matchId,
      };
    })
  );

  return Response.json({ presences });
}
