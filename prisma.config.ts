import path from "node:path";
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url,
  },
  migrate: {
    async adapter() {
      const { PrismaLibSQL } = await import("@prisma/adapter-libsql");
      const { createClient } = await import("@libsql/client");
      const client = createClient({ url });
      return new PrismaLibSQL(client);
    },
  },
});
