import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next.js 15 명세: params는 Promise
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { status } = await req.json();
  const { id: scrimId } = await params; // params를 await 하여 id 추출

  const updateData: any = { status };

  if (status === "playing") {
    updateData.startedAt = new Date();
  } else if (status === "finished") {
    updateData.endedAt = new Date();
  }

  try {
    const updatedScrim = await prisma.scrimSession.update({
      where: { id: scrimId },
      data: updateData,
    });

    return Response.json(updatedScrim);
  } catch (error) {
    console.error("Failed to update scrim status", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
