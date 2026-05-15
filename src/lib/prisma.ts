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
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ["error"] });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrisma();
globalForPrisma.prisma = prisma;
