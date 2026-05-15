#!/usr/bin/env node

const { execSync } = require("child_process");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const BASELINE_MIGRATIONS = [
  "20260502033644_init",
  "20260502040955_add_nextauth_models",
  "20260502041500_add_discord_id",
  "20260502062941_add_guildmember_roles",
  "20260502100000_add_activity_scrim_announcement",
  "20260502110000_full_feature_expansion",
  "20260507010000_add_highlight_channel",
  "20260507030000_add_riot_account_cache",
  "20260513000000_add_missing_indexes",
];

function getLocalMigrations() {
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let shouldRunMigrate = true;

  try {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
      )
    `);

    if (!rows[0].exists) {
      console.log("_prisma_migrations table missing. Resolving baseline migrations...");
      for (const name of BASELINE_MIGRATIONS) {
        console.log(`  baseline: ${name}`);
        execSync(`npx prisma migrate resolve --applied "${name}"`, { stdio: "inherit" });
      }
      console.log("Baseline complete.");
    } else {
      console.log("_prisma_migrations table exists. Checking pending migrations...");
      const appliedResult = await client.query(`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE rolled_back_at IS NULL
      `);
      const applied = new Set(appliedResult.rows.map((row) => row.migration_name));
      const pending = getLocalMigrations().filter((name) => !applied.has(name));

      if (pending.length === 0) {
        console.log("No pending migrations. Skipping prisma migrate deploy.");
        shouldRunMigrate = false;
      } else {
        console.log(`Pending migrations: ${pending.join(", ")}`);
      }
    }
  } finally {
    await client.end();
  }

  if (!shouldRunMigrate) return;

  console.log("Running prisma migrate deploy...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  console.log("Migration deploy complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
