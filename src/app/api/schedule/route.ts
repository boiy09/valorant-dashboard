import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");

  const events = await prisma.scrimEvent.findMany({
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return Response.json({ events });
}
