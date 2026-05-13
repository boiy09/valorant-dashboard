import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

  const events = await prisma.scrimEvent.findMany({
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return Response.json({ events });
}
