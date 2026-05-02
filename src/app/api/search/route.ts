import { NextRequest } from "next/server";
import { getPlayerStats } from "@/lib/valorant";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.includes("#")) {
    return Response.json({ error: "닉네임#태그 형식으로 입력해주세요." }, { status: 400 });
  }

  const [gameName, tagLine] = q.split("#");
  try {
    const data = await getPlayerStats(gameName, tagLine);
    return Response.json(data);
  } catch (e: any) {
    if (e?.response?.status === 404) {
      return Response.json({ error: "플레이어를 찾을 수 없어요." }, { status: 404 });
    }
    return Response.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}
