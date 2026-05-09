import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureProfileColumns } from "@/lib/profileColumns";

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

function parseAgents(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((agent) => agent.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  await ensureProfileColumns();

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({
    valorantRole: user.valorantRole,
    favoriteAgents: parseAgents(user.favoriteAgents),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  await ensureProfileColumns();

  const body = await req.json().catch(() => null) as {
    valorantRole?: unknown;
    favoriteAgents?: unknown;
  } | null;

  const valorantRole = typeof body?.valorantRole === "string" ? body.valorantRole : null;
  const favoriteAgents = Array.isArray(body?.favoriteAgents)
    ? body.favoriteAgents.filter((agent): agent is string => typeof agent === "string").map((agent) => agent.trim()).filter(Boolean).slice(0, 3)
    : [];

  if (valorantRole && !ALLOWED_ROLES.has(valorantRole)) {
    return Response.json({ error: "지원하지 않는 역할군입니다." }, { status: 400 });
  }

  const user = await findUser(session.user.id, session.user.email);
  if (!user) {
    return Response.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      valorantRole,
      favoriteAgents: favoriteAgents.join(","),
    },
  });

  return Response.json({
    valorantRole: updated.valorantRole,
    favoriteAgents: parseAgents(updated.favoriteAgents),
  });
}
