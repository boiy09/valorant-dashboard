import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

function summarizeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return { exists: false };
  }

  try {
    const parsed = new URL(raw);
    return {
      exists: true,
      protocol: parsed.protocol,
      username: parsed.username,
      host: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname.replace(/^\//, ""),
      schema: parsed.searchParams.get("schema"),
    };
  } catch {
    return {
      exists: true,
      invalid: true,
      preview: raw.slice(0, 32),
    };
  }
}

export async function GET() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) return Response.json({ error: "권한이 없습니다." }, { status: 403 });

  const dbUrl = summarizeDatabaseUrl();

  try {
    const [userCount, userTable] = await Promise.all([
      prisma.user.count(),
      prisma.$queryRaw<Array<{ regclass: string | null }>>`SELECT to_regclass('public."User"') AS regclass`,
    ]);

    return Response.json({
      ok: true,
      databaseUrl: dbUrl,
      userTable: userTable[0]?.regclass ?? null,
      userCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      {
        ok: false,
        databaseUrl: dbUrl,
        error: message,
      },
      { status: 500 },
    );
  }
}
