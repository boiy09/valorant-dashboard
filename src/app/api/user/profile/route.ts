import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = new Set(["Duelist", "Initiator", "Controller", "Sentinel"]);

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

function isMissingColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("does not exist in the current database");
}

async function getAvailableProfileColumns() {
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name IN ('profileBio', 'valorantRole', 'favoriteAgents')
  `;
  return new Set(rows.map((row) => row.column_name));
}

async function ensureProfileBioColumn(columns: Set<string>) {
  if (columns.has("profileBio")) return columns;

  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileBio" TEXT NOT NULL DEFAULT ''`);
  return getAvailableProfileColumns();
}

function parseAgents(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((agent) => agent.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function parseRoles(value: string | null | undefined) {
  return Array.from(new Set(
    (value ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter((role) => ALLOWED_ROLES.has(role))
  ));
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const columns = await getAvailableProfileColumns();
    let user: Awaited<ReturnType<typeof findUser>>;
    try {
      user = await findUser(session.user.id, session.user.email);
    } catch (error) {
      if (isMissingColumnError(error)) {
        return Response.json({ profileBio: "", valorantRole: null, favoriteAgents: [], schemaPending: true });
      }
      throw error;
    }

    if (!user) {
      return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    return Response.json({
      profileBio: columns.has("profileBio") ? (user as any).profileBio ?? "" : "",
      valorantRole: columns.has("valorantRole") ? user.valorantRole : null,
      favoriteAgents: columns.has("favoriteAgents") ? parseAgents(user.favoriteAgents) : [],
      schemaPending: !columns.has("profileBio"),
    });
  } catch (error) {
    console.error("프로필 조회 오류:", error);
    return Response.json({ error: "프로필 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as {
      profileBio?: unknown;
      valorantRole?: unknown;
      favoriteAgents?: unknown;
    } | null;

    const valorantRoles = Array.isArray(body?.valorantRole)
      ? Array.from(new Set(
          body.valorantRole
            .filter((role): role is string => typeof role === "string")
            .map((role) => role.trim())
            .filter(Boolean)
        ))
      : typeof body?.valorantRole === "string"
        ? parseRoles(body.valorantRole)
        : [];
    const favoriteAgents = Array.isArray(body?.favoriteAgents)
      ? body.favoriteAgents
          .filter((agent): agent is string => typeof agent === "string")
          .map((agent) => agent.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];
    const profileBio = typeof body?.profileBio === "string" ? body.profileBio.trim().slice(0, 80) : "";

    if (valorantRoles.some((role) => !ALLOWED_ROLES.has(role))) {
      return Response.json({ error: "지원하지 않는 역할군입니다." }, { status: 400 });
    }

    let columns = await getAvailableProfileColumns();
    columns = await ensureProfileBioColumn(columns);
    if (!columns.has("profileBio")) {
      return Response.json(
        { error: "프로필 한줄 소개 DB 반영이 필요합니다. VPS에서 prisma db push를 먼저 실행해야 합니다." },
        { status: 503 }
      );
    }

    let user: Awaited<ReturnType<typeof findUser>>;
    try {
      user = await findUser(session.user.id, session.user.email);
    } catch (error) {
      if (isMissingColumnError(error)) {
        return Response.json(
          { error: "프로필 저장용 DB 컬럼 반영이 아직 필요합니다. VPS에서 prisma db push를 먼저 실행해 주세요." },
          { status: 503 }
        );
      }
      throw error;
    }

    if (!user) {
      return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        profileBio,
        valorantRole: valorantRoles.join(",") || null,
        favoriteAgents: favoriteAgents.join(","),
      } as any,
    });

    return Response.json({
      profileBio: (updated as any).profileBio ?? "",
      valorantRole: updated.valorantRole,
      favoriteAgents: parseAgents(updated.favoriteAgents),
    });
  } catch (error) {
    console.error("프로필 저장 오류:", error);
    return Response.json({ error: "프로필 저장 중 서버 오류가 발생했습니다." }, { status: 500 });
  }
}
