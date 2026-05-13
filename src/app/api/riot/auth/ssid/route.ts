import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokens, getAuthTokens } from "@/lib/riotAuth";

type RiotAccountRow = {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
};

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
  const accountRows = accounts as RiotAccountRow[];
  const preferred =
    accountRows.find((a) => a.region === "KR") ??
    accountRows.find((a) => a.region === "AP") ??
    null;
  await prisma.user.update({
    where: { id: userId },
    data: preferred
      ? { riotPuuid: preferred.puuid, riotGameName: preferred.gameName, riotTagLine: preferred.tagLine }
      : { riotPuuid: null, riotGameName: null, riotTagLine: null },
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

  const body = await req.json() as { ssid?: string };
  const raw = (body.ssid ?? "").trim();
  if (!raw) {
    return Response.json({ error: "쿠키 값을 입력해 주세요." }, { status: 400 });
  }

  // ssid가 포함된 전체 쿠키 문자열, 또는 ssid 값만 입력한 경우 모두 허용
  const ssidCookie = raw.includes("ssid=") ? raw : `ssid=${raw}`;

  if (!ssidCookie.includes("ssid=")) {
    return Response.json({ error: "ssid 쿠키가 포함되어 있지 않습니다. Network 탭의 Cookie 헤더 전체를 복사해 주세요." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const authResult = await refreshTokens(ssidCookie);

    if (authResult.status !== "success") {
      const detail = authResult.status === "error" ? authResult.message : "알 수 없는 오류";
      console.error("[ssid route] refreshTokens 실패:", detail);
      return Response.json(
        { error: `ssid 쿠키가 유효하지 않습니다. (${detail})` },
        { status: 401 }
      );
    }

    const tokens = await getAuthTokens(
      authResult.accessToken,
      authResult.idToken,
      authResult.cookies
    );

    const region = normalizeRegion(tokens.region);
    const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    const otherPuuid = await prisma.riotAccount.findUnique({ where: { puuid: tokens.puuid } });
    if (otherPuuid && otherPuuid.userId !== user.id) {
      return Response.json(
        { error: "이미 다른 계정에 연결된 라이엇 계정입니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.riotAccount.findFirst({ where: { userId: user.id, region } });

    let account;
    if (existing) {
      account = await prisma.riotAccount.update({
        where: { id: existing.id },
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
    console.error("ssid auth error:", message);
    return Response.json({ error: `연동 중 오류가 발생했습니다. (${message})` }, { status: 500 });
  }
}
