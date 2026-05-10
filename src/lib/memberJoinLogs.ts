import { randomUUID } from "crypto";
import { prisma } from "./prisma";

export async function ensureMemberJoinLogTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GuildMemberJoinLog" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "guildId" TEXT NOT NULL,
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GuildMemberJoinLog_guildId_userId_idx"
    ON "GuildMemberJoinLog" ("guildId", "userId")
  `);
}

export async function recordMemberJoin(userId: string, guildId: string) {
  await ensureMemberJoinLogTable();
  await prisma.$executeRaw`
    INSERT INTO "GuildMemberJoinLog" ("id", "userId", "guildId", "joinedAt")
    VALUES (${randomUUID()}, ${userId}, ${guildId}, ${new Date()})
  `;
}
