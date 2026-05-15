import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { createAuctionAccessToken } from "@/lib/auctionAccess";

interface AuctionRow {
  captainPoints: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function getAuction(sessionId: string) {
  const rows = await prisma.$queryRawUnsafe<AuctionRow[]>(
    `SELECT "captainPoints" FROM "AuctionState" WHERE "sessionId" = $1 LIMIT 1`,
    sessionId
  );
  return rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  const { session, isAdmin } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });

  const scrim = await prisma.scrimSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
  if (!scrim) return Response.json({ error: "내전을 찾을 수 없습니다." }, { status: 404 });
  if (scrim.mode !== "auction") return Response.json({ error: "경매 내전이 아닙니다." }, { status: 400 });

  const auction = await getAuction(sessionId);
  const captainPoints = parseJson<Record<string, number>>(auction?.captainPoints, {});
  const captainIds = Object.keys(captainPoints);
  const origin = req.nextUrl.origin;

  const captains = captainIds.map((captainId, index) => {
    const player = scrim.players.find((item) => item.userId === captainId);
    const token = createAuctionAccessToken({ sessionId, role: "captain", captainId });
    return {
      role: "captain" as const,
      captainId,
      label: `${player?.user.name ?? `팀장 ${index + 1}`} 링크`,
      href: `${origin}/auction/${token}`,
    };
  });

  const hostToken = createAuctionAccessToken({ sessionId, role: "host" });
  const observerToken = createAuctionAccessToken({ sessionId, role: "observer" });

  return Response.json({
    links: [
      { role: "host", label: "주최자 링크", href: `${origin}/auction/${hostToken}` },
      ...captains,
      { role: "observer", label: "옵저버 링크", href: `${origin}/auction/${observerToken}` },
    ],
  });
}
