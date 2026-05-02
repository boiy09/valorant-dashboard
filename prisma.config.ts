import path from "node:path";
import { defineConfig } from "prisma/config";

const fallbackUrl =
  "postgresql://postgres:password@localhost:5432/valorant_dashboard?schema=public";
const databaseUrl =
  process.env.DATABASE_URL?.startsWith("postgresql://")
    ? process.env.DATABASE_URL
    : fallbackUrl;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: databaseUrl,
  },
});
