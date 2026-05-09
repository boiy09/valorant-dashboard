import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTierName } from "@/lib/tierName";
import { getRankIconByTier } from "@/lib/valorant";
import { ensureValidTokens, fetchProfile, fetchRank } from "@/lib/rankFetcher";

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
  puuid: string;
  accessToken: string | null;
  entitlementsToken: string | null;
  ssid: string | null;
  tokenExpiresAt: Date | null;
  cachedTierId: number | null;
  cachedTierName: string | null;
  cachedLevel: number | null;
  cachedCard: string | null;
  rankCachedAt: Date | null;
}) {
  return {
    id: account.id,
    region: account.region,
    riotId: `${account.gameName}#${account.tagLine}`,
    isVerified: account.isVerified,
  };
}

async function toDetailedAccountResponse(account: Parameters<typeof toAccountResponse>[0]) {
  const cacheAge = account.rankCachedAt ? Date.now() - account.rankCachedAt.getTime() : Infinity;
  const isFresh = cacheAge < 2 * 60 * 60 * 1000 && account.cachedTierId !== null && (account.cachedLevel !== null || account.cachedCard !== null);

  if (isFresh) {
    return {
      ...toAccountResponse(account),
      level: account.cachedLevel,
      card: account.cachedCard,
      tier: normalizeTierName(account.cachedTierName, account.cachedTierId),
      rankIcon: account.cachedTierId ? await getRankIconByTier(account.cachedTierId).catch(() => null) : null,
    };
  }

  const tokens = await ensureValidTokens(
    account.puuid,
    account.accessToken,
    account.entitlementsToken,
    account.ssid,
    account.tokenExpiresAt
  );
  const [rank, profile] = await Promise.all([
    fetchRank(account.puuid, account.region, account.gameName, account.tagLine, tokens),
    fetchProfile(account.puuid, account.region, account.gameName, account.tagLine, tokens),
  ]);

  prisma.riotAccount.update({
    where: { puuid: account.puuid },
    data: {
      cachedTierId: rank.tierId,
      cachedTierName: rank.tierName,
      cachedLevel: profile.level,
      cachedCard: profile.card,
      rankCachedAt: new Date(),
    },
  }).catch(() => {});

  return {
    ...toAccountResponse(account),
    level: profile.level,
    card: profile.card,
    tier: rank.tierName,
    rankIcon: rank.rankIcon,
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
    accounts: await Promise.all(accounts.map(toDetailedAccountResponse)),
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
