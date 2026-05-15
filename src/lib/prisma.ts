import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const fallbackUrl =
  "postgresql://postgres:password@localhost:5432/valorant_dashboard?schema=public";

function createPrisma() {
  const connectionString =
    process.env.DATABASE_URL?.startsWith("postgresql://")
      ? process.env.DATABASE_URL
      : fallbackUrl;

  const pool = new Pool({
    connectionString,
    max: 1,                      // 서버리스: 인스턴스당 최대 1개
    idleTimeoutMillis: 300000,   // keep the warm DB connection around between bursts
    connectionTimeoutMillis: 4000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ["error"] });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// 빌드 타임에는 Prisma 인스턴스를 생성하지 않음
export const prisma: PrismaClient = (() => {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return {} as PrismaClient;
  }
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrisma();
  globalForPrisma.prisma = client;
  return client;
})();
