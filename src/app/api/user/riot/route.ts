import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlayerByRiotId } from "@/lib/valorant";

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

function normalizeRegion(region: unknown): RiotRegion | null {
  if (typeof region !== "string") return null;
  const normalized = region.trim().toUpperCase();
  return ALLOWED_REGIONS.includes(normalized as RiotRegion)
    ? (normalized as RiotRegion)
    : null;
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

function toAccountResponse(account: {
  id: string;
  gameName: string;
  tagLine: string;
  region: string;
}) {
  return {
    id: account.id,
    region: account.region,
    riotId: `${account.gameName}#${account.tagLine}`,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ linked: false, accounts: [] });

  const user = await findUser(session.user.id, session.user.email);
  if (!user) return Response.json({ linked: false, accounts: [] });

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

  const { riotId, region } = await req.json();
  const selectedRegion = normalizeRegion(region);

  if (!selectedRegion) {
    return Response.json({ error: "지역은 KR 또는 AP만 선택할 수 있습니다." }, { status: 400 });
  }

  if (!riotId || typeof riotId !== "string" || !riotId.includes("#")) {
    return Response.json(
      { error: "올바른 형식으로 입력해주세요. (예: 플레이어#KR1)" },
      { status: 400 }
    );
  }

  const [rawGameName, rawTagLine] = riotId.split("#");
  const gameName = rawGameName?.trim();
  const tagLine = rawTagLine?.trim();

  if (!gameName || !tagLine) {
    return Response.json(
      { error: "올바른 형식으로 입력해주세요. (예: 플레이어#KR1)" },
      { status: 400 }
    );
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const existingAccounts = await prisma.riotAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (existingAccounts.length >= ALLOWED_REGIONS.length) {
    return Response.json(
      { error: "한 디스코드 계정에는 한섭(KR)과 아섭(AP)만 연결할 수 있습니다." },
      { status: 400 }
    );
  }

  const existingInRegion = existingAccounts.find((account) => account.region === selectedRegion);
  if (existingInRegion) {
    return Response.json(
      { error: `${selectedRegion} 계정은 이미 연결되어 있습니다. 먼저 삭제 후 다시 연결해주세요.` },
      { status: 400 }
    );
  }

  try {
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const finalGameName = profile.gameName || gameName;
    const finalTagLine = profile.tagLine || tagLine;

    const alreadyLinked = await prisma.riotAccount.findUnique({
      where: { puuid: profile.puuid },
    });

    if (alreadyLinked) {
      return Response.json({ error: "이미 연결된 라이엇 계정입니다." }, { status: 400 });
    }

    const account = await prisma.riotAccount.create({
      data: {
        userId: user.id,
        puuid: profile.puuid,
        gameName: finalGameName,
        tagLine: finalTagLine,
        region: selectedRegion,
        isPrimary: false,
      },
    });

    await syncLegacyRiotFields(user.id);

    return Response.json({
      success: true,
      account: toAccountResponse(account),
    });
  } catch (error: any) {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.errors?.[0]?.message ?? error?.message ?? "알 수 없는 오류";
    console.error(`Riot 연동 오류 [${status ?? "?"}]:`, message);

    if (status === 404) {
      return Response.json(
        { error: "플레이어를 찾을 수 없습니다. 게임명과 태그를 다시 확인해주세요." },
        { status: 404 }
      );
    }
    if (status === 429) {
      return Response.json(
        { error: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 }
      );
    }
    if (status === 401 || status === 403) {
      return Response.json(
        { error: "Riot API 인증에 문제가 있습니다. 관리자에게 문의해주세요." },
        { status: 503 }
      );
    }

    return Response.json({ error: `계정 연동 중 오류가 발생했습니다. (${message})` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await req.json();
  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
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
