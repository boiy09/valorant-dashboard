import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlayerByRiotId } from "@/lib/valorant";

const MAX_ACCOUNTS = 5;

async function findUser(discordId: string, email?: string | null) {
  let user = await prisma.user.findUnique({ where: { discordId } });
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) await prisma.user.update({ where: { id: user.id }, data: { discordId } });
  }
  return user;
}

async function syncPrimaryToUser(userId: string) {
  const primary = await prisma.riotAccount.findFirst({
    where: { userId, isPrimary: true },
  });
  if (primary) {
    await prisma.user.update({
      where: { id: userId },
      data: { riotPuuid: primary.puuid, riotGameName: primary.gameName, riotTagLine: primary.tagLine },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { riotPuuid: null, riotGameName: null, riotTagLine: null },
    });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ linked: false, accounts: [] });

  const user = await findUser(session.user.id, session.user.email);
  if (!user) return Response.json({ linked: false, accounts: [] });

  const accounts = await prisma.riotAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  return Response.json({
    linked: accounts.length > 0,
    accounts: accounts.map(a => ({
      id: a.id,
      riotId: `${a.gameName}#${a.tagLine}`,
      isPrimary: a.isPrimary,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { riotId } = await req.json();
  if (!riotId?.includes("#")) {
    return Response.json({ error: "올바른 형식으로 입력해주세요. (닉네임#태그)" }, { status: 400 });
  }

  const [gameName, tagLine] = riotId.split("#");
  const user = await findUser(session.user.id, session.user.email);
  if (!user) return Response.json({ error: "유저 정보를 찾을 수 없어요." }, { status: 404 });

  const existing = await prisma.riotAccount.findMany({ where: { userId: user.id } });
  if (existing.length >= MAX_ACCOUNTS) {
    return Response.json({ error: `최대 ${MAX_ACCOUNTS}개까지 연동할 수 있어요.` }, { status: 400 });
  }

  try {
    const profile = await getPlayerByRiotId(gameName, tagLine);
    const finalGameName = profile.gameName || gameName;
    const finalTagLine = profile.tagLine || tagLine;

    const alreadyLinked = existing.find(a => a.puuid === profile.puuid);
    if (alreadyLinked) {
      return Response.json({ error: "이미 연동된 계정이에요." }, { status: 400 });
    }

    const isFirst = existing.length === 0;
    const account = await prisma.riotAccount.create({
      data: { userId: user.id, puuid: profile.puuid, gameName: finalGameName, tagLine: finalTagLine, isPrimary: isFirst },
    });

    if (isFirst) await syncPrimaryToUser(user.id);

    return Response.json({ success: true, account: { id: account.id, riotId: `${finalGameName}#${finalTagLine}`, isPrimary: isFirst } });
  } catch (error: any) {
    const status = error?.response?.status;
    const msg = error?.response?.data?.errors?.[0]?.message ?? error?.message ?? "알 수 없는 오류";
    console.error(`Riot 연동 오류 [${status ?? "?"}]:`, msg);

    if (status === 404) return Response.json({ error: "플레이어를 찾을 수 없어요. 닉네임#태그를 확인해주세요." }, { status: 404 });
    if (status === 429) return Response.json({ error: "API 요청 한도 초과. 잠시 후 다시 시도해주세요." }, { status: 429 });
    if (status === 401 || status === 403) return Response.json({ error: "API 키가 만료됐어요. 관리자에게 문의하세요." }, { status: 503 });
    return Response.json({ error: `연동 오류: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await req.json();
  const user = await findUser(session.user.id, session.user.email);
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  const account = await prisma.riotAccount.findFirst({ where: { id, userId: user.id } });
  if (!account) return Response.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });

  await prisma.riotAccount.delete({ where: { id } });

  // 대표 계정이 삭제됐으면 다음 계정을 대표로 승격
  if (account.isPrimary) {
    const next = await prisma.riotAccount.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.riotAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  await syncPrimaryToUser(user.id);
  return Response.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await req.json();
  const user = await findUser(session.user.id, session.user.email);
  if (!user) return Response.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });

  const account = await prisma.riotAccount.findFirst({ where: { id, userId: user.id } });
  if (!account) return Response.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });

  await prisma.riotAccount.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
  await prisma.riotAccount.update({ where: { id }, data: { isPrimary: true } });
  await syncPrimaryToUser(user.id);

  return Response.json({ success: true });
}
