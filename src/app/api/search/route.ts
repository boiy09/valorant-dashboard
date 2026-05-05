import { NextRequest } from "next/server";
import { getPlayerStats } from "@/lib/valorant";

type RiotRegion = "KR" | "AP";

function normalizeRegion(region: string | null): RiotRegion {
  return region?.toUpperCase() === "AP" ? "AP" : "KR";
}

function toQueryRegion(region: RiotRegion): "kr" | "ap" {
  return region === "AP" ? "ap" : "kr";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const region = normalizeRegion(req.nextUrl.searchParams.get("region"));

  if (!q || !q.includes("#")) {
    return Response.json({ error: "이름#태그 형식으로 입력해 주세요." }, { status: 400 });
  }

  const [gameName, tagLine] = q.split("#");

  try {
    const data = await getPlayerStats(gameName, tagLine, toQueryRegion(region));
    return Response.json({ ...data, region });
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return Response.json({ error: "플레이어를 찾을 수 없습니다." }, { status: 404 });
    }

    return Response.json({ error: "검색 중 서버 오류가 발생했습니다." }, { status: 500 });
  }
}
