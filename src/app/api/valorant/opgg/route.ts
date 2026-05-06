import { auth } from "@/lib/auth";
import { buildOpGgValorantProfileUrls, fetchOpGgValorantProfile } from "@/lib/opgg";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Login required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const gameName = url.searchParams.get("gameName")?.trim();
  const tagLine = url.searchParams.get("tagLine")?.trim();

  if (!gameName || !tagLine) {
    return Response.json(
      { error: "gameName and tagLine are required. Example: /api/valorant/opgg?gameName=OTL&tagLine=dawon" },
      { status: 400 }
    );
  }

  const checkedUrls = buildOpGgValorantProfileUrls(gameName, tagLine);
  const profile = await fetchOpGgValorantProfile(gameName, tagLine);

  return Response.json({
    ok: Boolean(profile),
    checkedUrls,
    profile,
  });
}
