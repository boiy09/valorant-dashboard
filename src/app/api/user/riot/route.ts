import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initRiotAuth, getAuthTokens } from "@/lib/riotAuth";

const ALLOWED_REGIONS = ["KR", "AP"] as const;
type RiotRegion = (typeof ALLOWED_REGIONS)[number];

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
    accounts.find((account) => account.region === "KR") ??
    accounts.find((account) => account.region === "AP") ??
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

function normalizeRegion(raw: string): RiotRegion {
  const lower = raw.toLowerCase();
  if (lower === "kr") return "KR";
  if (lower === "ap") return "AP";
  const upper = raw.toUpperCase() as RiotRegion;
  return upper;
}

function toAccountResponse(account: {
  id: string;
  gameName: string;
  tagLine: string;
  region: string;
  isVerified: boolean;
}) {
  return {
    id: account.id,
    region: account.region,
    riotId: `${account.gameName}#${account.tagLine}`,
    isVerified: account.isVerified,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ linked: false, accounts: [] });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ linked: false, accounts: [] });
  }

  const accounts = await prisma.riotAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ region: "asc" }, { createdAt: "asc" }],
  });

  return Response.json({
    linked: accounts.length > 0,
    accounts: accounts.map(toAccountResponse),
    availableRegions: ALLOWED_REGIONS,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json() as { username?: string; password?: string };
  const { username, password } = body;

  if (!username || typeof username !== "string" || !username.trim()) {
    return Response.json({ error: "라이엇 아이디를 입력해 주세요." }, { status: 400 });
  }
  if (!password || typeof password !== "string" || !password.trim()) {
    return Response.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const authResult = await initRiotAuth(username.trim(), password);

    if (authResult.status === "error") {
      return Response.json({ error: authResult.message }, { status: 401 });
    }

    if (authResult.status === "mfa") {
      // 쿠키를 base64로 인코딩해서 반환 (비밀번호는 이미 사용됨, 저장 안 함)
      const pendingCookies = Buffer.from(authResult.cookies).toString("base64");
      return Response.json({ mfa: true, pendingCookies });
    }

    // status === "success"
    const tokens = await getAuthTokens(
      authResult.accessToken,
      authResult.idToken,
      authResult.cookies
    );

    const region = normalizeRegion(tokens.region);

    // 계정 수 초과 검사 (KR/AP 각 1개씩)
    const existingAccounts = await prisma.riotAccount.findMany({
      where: { userId: user.id },
    });

    const sameRegion = existingAccounts.find((a) => a.region === region);
    const otherPuuid = await prisma.riotAccount.findUnique({ where: { puuid: tokens.puuid } });

    if (otherPuuid && otherPuuid.userId !== user.id) {
      return Response.json(
        { error: "이미 다른 계정에 연결된 라이엇 계정입니다." },
        { status: 400 }
      );
    }

    const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000); // ~55분 후

    let account;
    if (sameRegion) {
      // 같은 region이 있으면 upsert
      account = await prisma.riotAccount.update({
        where: { id: sameRegion.id },
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
      account: toAccountResponse(account),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Riot auth error:", message);
    return Response.json(
      { error: `계정 연결 중 오류가 발생했습니다. (${message})` },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await req.json() as { id: string };
  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const account = await prisma.riotAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!account) {
    return Response.json({ error: "연결된 계정을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.riotAccount.delete({ where: { id } });
  await syncLegacyRiotFields(user.id);

  return Response.json({ success: true });
}
