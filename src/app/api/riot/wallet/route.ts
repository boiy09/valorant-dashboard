import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokens, getAuthTokens } from "@/lib/riotAuth";
import { getWallet } from "@/lib/riotPrivateApi";
import type { RiotAccount } from "@prisma/client";

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({ where: { discordId } });
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { discordId } });
    }
  }
  return user;
}

async function getValidTokens(accountId: string, userId: string): Promise<RiotAccount | null> {
  const account = await prisma.riotAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!account || !account.accessToken || !account.entitlementsToken) return null;
  if (!account.isVerified) return null;

  const expiresAt = account.tokenExpiresAt;
  const needsRefresh = !expiresAt || expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (!needsRefresh) return account;

  if (!account.ssid) return null;

  const refreshResult = await refreshTokens(account.ssid);
  if (refreshResult.status !== "success") return null;

  try {
    const tokens = await getAuthTokens(
      refreshResult.accessToken,
      refreshResult.idToken,
      refreshResult.cookies
    );

    const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    const updated = await prisma.riotAccount.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.accessToken,
        entitlementsToken: tokens.entitlementsToken,
        tokenExpiresAt,
        ssid: tokens.ssid || account.ssid,
      },
    });

    return updated;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return Response.json({ error: "accountId가 필요합니다." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const account = await getValidTokens(accountId, user.id);
  if (!account) {
    return Response.json(
      { error: "계정 인증이 필요합니다. 라이엇 계정을 다시 연동해 주세요." },
      { status: 403 }
    );
  }

  try {
    const wallet = await getWallet(
      account.puuid,
      account.accessToken!,
      account.entitlementsToken!,
      account.region
    );
    return Response.json(wallet);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Wallet fetch error:", message);

    if (message.includes("403") || message.includes("401")) {
      return Response.json(
        { error: "인증이 만료되었습니다. 라이엇 계정을 다시 연동해 주세요." },
        { status: 403 }
      );
    }
    if (message.includes("429")) {
      return Response.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    return Response.json(
      { error: `지갑 조회 중 오류가 발생했습니다. (${message})` },
      { status: 500 }
    );
  }
}
