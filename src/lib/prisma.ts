import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const fallbackUrl =
  "postgresql://postgres:password@localhost:5432/valorant_dashboard?schema=public";

function createPrisma() {
  const connectionString =
    process.env.DATABASE_URL?.startsWith("postgresql://")
      ? process.env.DATABASE_URL
      : fallbackUrl;
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter, log: ["error"] });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
