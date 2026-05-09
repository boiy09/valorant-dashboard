import { prisma } from "@/lib/prisma";

let ensured = false;

export async function ensureProfileColumns() {
  if (ensured) return;

  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "valorantRole" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "favoriteAgents" TEXT NOT NULL DEFAULT ''`);

  ensured = true;
}
