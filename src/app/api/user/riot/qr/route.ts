import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthTokens } from "@/lib/riotAuth";

const ALLOWED_REGIONS = ["KR", "AP"] as const;
type RiotRegion = (typeof ALLOWED_REGIONS)[number];

function normalizeRegion(raw: string): RiotRegion {
  const lower = raw.toLowerCase();
  if (lower === "kr") return "KR";
  if (lower === "ap") return "AP";
  return raw.toUpperCase() as RiotRegion;
}

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
      ? { riotPuuid: preferred.puuid, riotGameName: preferred.gameName, riotTagLine: preferred.tagLine }
      : { riotPuuid: null, riotGameName: null, riotTagLine: null },
  });
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

const proxyUrl = process.env.RIOT_AUTH_PROXY_URL;
const proxySecret = process.env.RIOT_AUTH_PROXY_SECRET;

// POST /api/user/riot/qr - QR 세션 시작
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!proxyUrl || !proxySecret) {
    return Response.json({ error: "프록시 서버가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    const res = await fetch(`${proxyUrl}/qr/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-secret": proxySecret,
      },
      cache: "no-store",
    });

    const data = await res.json() as { status: string; loginToken?: string; deviceId?: string; message?: string; raw?: unknown };

    if (data.status !== "ok" || !data.loginToken) {
      console.error("[qr/route] QR 초기화 실패:", data);
      return Response.json({ error: data.message ?? "QR 세션을 시작할 수 없습니다.", debug: data }, { status: 500 });
    }

    return Response.json({ loginToken: data.loginToken, deviceId: data.deviceId ?? "" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET /api/user/riot/qr?token=xxx&deviceId=yyy - 폴링
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!proxyUrl || !proxySecret) {
    return Response.json({ error: "프록시 서버가 설정되지 않았습니다." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const deviceId = searchParams.get("deviceId") ?? "";

  if (!token) {
    return Response.json({ error: "token이 필요합니다." }, { status: 400 });
  }

  try {
    const pollUrl = `${proxyUrl}/qr/poll?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`;
    const res = await fetch(pollUrl, {
      headers: { "x-proxy-secret": proxySecret },
      cache: "no-store",
    });

    const data = await res.json() as {
      status: string;
      accessToken?: string;
      idToken?: string;
      cookies?: string;
      raw?: unknown;
    };

    if (data.status === "pending") {
      return Response.json({ status: "pending" });
    }

    if (data.status === "expired") {
      return Response.json({ status: "expired" });
    }

    if (data.status === "success" && data.accessToken) {
      // 토큰 교환 후 DB 저장
      const user = await findUser(session.user.id, session.user.email);
      if (!user) {
        return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
      }

      const tokens = await getAuthTokens(data.accessToken, data.idToken ?? "", data.cookies ?? "");
      const region = normalizeRegion(tokens.region);

      const existingAccounts = await prisma.riotAccount.findMany({ where: { userId: user.id } });
      const sameRegion = existingAccounts.find((a) => a.region === region);
      const otherPuuid = await prisma.riotAccount.findUnique({ where: { puuid: tokens.puuid } });

      if (otherPuuid && otherPuuid.userId !== user.id) {
        return Response.json({ error: "이미 다른 계정에 연결된 라이엇 계정입니다." }, { status: 400 });
      }

      const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

      let account;
      if (sameRegion) {
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

      return Response.json({ status: "success", account: toAccountResponse(account) });
    }

    // authenticated_raw - 토큰 구조 확인 필요
    if (data.status === "authenticated_raw") {
      console.error("[qr/route] 인증됐지만 토큰 구조 미확인:", data.raw);
      return Response.json({ status: "error", error: "토큰 구조를 인식하지 못했습니다.", debug: data.raw });
    }

    return Response.json({ status: "error", error: "알 수 없는 응답" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: message }, { status: 500 });
  }
}
