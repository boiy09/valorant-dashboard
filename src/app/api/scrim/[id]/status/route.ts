import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { status } = await req.json();
  const scrimId = params.id;

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

    // 만약 종료 상태로 변경되었다면, 자동 경기 매칭 로직 트리거 가능
    // (여기서는 간단히 상태만 업데이트하고, 필요 시 별도 큐나 작업으로 처리)

    return Response.json(updatedScrim);
  } catch (error) {
    console.error("Failed to update scrim status", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
