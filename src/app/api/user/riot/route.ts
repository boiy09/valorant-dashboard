import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_REGIONS = ["KR", "AP"] as const;

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

  await req.json().catch(() => null);

  return Response.json(
    { error: "아이디/비밀번호 로그인 방식은 더 이상 지원하지 않습니다. URL 연동 방식을 사용해 주세요." },
    { status: 410 }
  );
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
