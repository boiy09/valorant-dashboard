import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthTokens } from "@/lib/riotAuth";

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
  const normalized = raw.toLowerCase();
  if (normalized === "kr") return "KR";
  if (normalized === "ap") return "AP";
  throw new Error(`지원하지 않는 서버 지역입니다: ${raw}`);
}

function regionLabel(region: "KR" | "AP") {
  return region === "KR" ? "한국 서버" : "아시아 서버";
}

// URL 해시에서 access_token, id_token 추출
function parseTokensFromUrl(input: string): { accessToken: string; idToken: string } | null {
  try {
    // Case 1: full URL with # fragment (https://playvalorant.com/opt_in#access_token=eyJ...)
    const hashIdx = input.indexOf("#");
    if (hashIdx !== -1) {
      const params = new URLSearchParams(input.slice(hashIdx + 1));
      const accessToken = params.get("access_token");
      const idToken = params.get("id_token");
      if (accessToken && idToken) return { accessToken, idToken };
    }

    // Case 2: raw fragment string with access_token= key (access_token=eyJ...&id_token=eyJ...)
    if (input.includes("access_token=")) {
      const params = new URLSearchParams(input);
      const accessToken = params.get("access_token");
      const idToken = params.get("id_token");
      if (accessToken && idToken) return { accessToken, idToken };
    }

    // Case 3: raw JWT value directly, with &id_token= embedded (eyJ...value...&id_token=eyJ...)
    if (input.startsWith("eyJ") && input.includes("&id_token=")) {
      const idTokenIdx = input.indexOf("&id_token=");
      const accessToken = input.slice(0, idTokenIdx);
      const afterIdToken = input.slice(idTokenIdx + "&id_token=".length);
      const idTokenEnd = afterIdToken.search(/&(?!amp;)/);
      const idToken = idTokenEnd !== -1 ? afterIdToken.slice(0, idTokenEnd) : afterIdToken;
      if (accessToken && idToken) return { accessToken, idToken };
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as {
    url?: string;
    accessToken?: string;
    idToken?: string;
    region?: "KR" | "AP";
  };

  let accessToken: string;
  let idToken: string;

  if (body.url) {
    const parsed = parseTokensFromUrl(body.url.trim());
    if (!parsed) {
      return Response.json(
        { error: "URL에서 토큰을 찾을 수 없습니다. 주소창의 URL 전체를 복사했는지 확인해 주세요." },
        { status: 400 }
      );
    }
    accessToken = parsed.accessToken;
    idToken = parsed.idToken;
  } else if (body.accessToken) {
    accessToken = body.accessToken;
    idToken = body.idToken ?? "";
  } else {
    return Response.json({ error: "URL 또는 토큰이 필요합니다." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const fallbackRegion = body.region ? normalizeRegion(body.region).toLowerCase() as "kr" | "ap" : undefined;
    const tokens = await getAuthTokens(accessToken, idToken, "", fallbackRegion);

    const region = normalizeRegion(tokens.region);
    const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    const otherPuuid = await prisma.riotAccount.findUnique({ where: { puuid: tokens.puuid } });
    if (otherPuuid && otherPuuid.userId !== user.id) {
      return Response.json({ error: "이미 다른 계정에 연결된 라이엇 계정입니다." }, { status: 400 });
    }

    const existing = await prisma.riotAccount.findFirst({ where: { userId: user.id, region } });

    let account;
    if (existing && existing.puuid !== tokens.puuid) {
      return Response.json(
        {
          error: `${regionLabel(region)} 계정은 이미 연결되어 있습니다. 다른 계정으로 바꾸려면 먼저 기존 계정을 해제해 주세요.`,
        },
        { status: 400 }
      );
    }

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
    console.error("token auth error:", message);
    return Response.json({ error: `연동 중 오류가 발생했습니다. (${message})` }, { status: 500 });
  }
}
