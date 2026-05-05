import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitMfa, getAuthTokens } from "@/lib/riotAuth";

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

async function syncLegacyRiotFields(userId: string) {
  const accounts = await prisma.riotAccount.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
  });

  const preferred =
    accounts.find((a) => a.region === "KR") ??
    accounts.find((a) => a.region === "AP") ??
    null;

  await prisma.user.update({
    where: { id: userId },
    data: preferred
      ? {
          riotPuuid: preferred.puuid,
          riotGameName: preferred.gameName,
          riotTagLine: preferred.tagLine,
        }
      : {
          riotPuuid: null,
          riotGameName: null,
          riotTagLine: null,
        },
  });
}

function normalizeRegion(raw: string): "KR" | "AP" {
  const lower = raw.toLowerCase();
  if (lower === "kr") return "KR";
  if (lower === "ap") return "AP";
  return "KR";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as { code?: string; pendingCookies?: string };
  const { code, pendingCookies } = body;

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return Response.json({ error: "6자리 인증 코드를 입력해 주세요." }, { status: 400 });
  }

  if (!pendingCookies || typeof pendingCookies !== "string") {
    return Response.json({ error: "인증 세션이 만료되었습니다. 다시 로그인해 주세요." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const cookies = Buffer.from(pendingCookies, "base64").toString("utf-8");
    const mfaResult = await submitMfa(cookies, code.trim());

    if (mfaResult.status === "error") {
      return Response.json({ error: mfaResult.message }, { status: 401 });
    }

    if (mfaResult.status !== "success") {
      return Response.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const tokens = await getAuthTokens(
      mfaResult.accessToken,
      mfaResult.idToken,
      mfaResult.cookies
    );

    const region = normalizeRegion(tokens.region);
    const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    const otherPuuid = await prisma.riotAccount.findUnique({
      where: { puuid: tokens.puuid },
    });

    if (otherPuuid && otherPuuid.userId !== user.id) {
      return Response.json(
        { error: "이미 다른 계정에 연결된 라이엇 계정입니다." },
        { status: 400 }
      );
    }

    const existingInRegion = await prisma.riotAccount.findFirst({
      where: { userId: user.id, region },
    });

    let account;
    if (existingInRegion) {
      account = await prisma.riotAccount.update({
        where: { id: existingInRegion.id },
        data: {
          puuid: tokens.puuid,
          gameName: tokens.gameName,
          tagLine: tokens.tagLine,
          ssid: tokens.ssid,
          accessToken: tokens.accessToken,
          entitlementsToken: tokens.entitlementsToken,
          tokenExpiresAt,
          isVerified: true,
        },
      });
    } else {
      account = await prisma.riotAccount.create({
        data: {
          userId: user.id,
          puuid: tokens.puuid,
          gameName: tokens.gameName,
          tagLine: tokens.tagLine,
          region,
          isPrimary: false,
          ssid: tokens.ssid,
          accessToken: tokens.accessToken,
          entitlementsToken: tokens.entitlementsToken,
          tokenExpiresAt,
          isVerified: true,
        },
      });
    }

    await syncLegacyRiotFields(user.id);

    return Response.json({
      success: true,
      account: {
        id: account.id,
        region: account.region,
        riotId: `${account.gameName}#${account.tagLine}`,
        isVerified: account.isVerified,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("MFA auth error:", message);
    return Response.json(
      { error: `인증 중 오류가 발생했습니다. (${message})` },
      { status: 500 }
    );
  }
}
