#!/usr/bin/env node
// 프로덕션 DB에 마이그레이션 히스토리가 없는 경우(db push로 초기 설정된 경우)
// 기존 마이그레이션을 baseline으로 표시한 뒤 새 마이그레이션만 실행합니다.

const { execSync } = require("child_process");
const { Client } = require("pg");

// 이미 DB에 적용된 것으로 간주할 기존 마이그레이션 목록 (note 컬럼 추가 이전까지)
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

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
      )
    `);

    if (!rows[0].exists) {
      console.log("_prisma_migrations 테이블 없음 → 기존 마이그레이션 baseline 처리 중...");
      for (const name of BASELINE_MIGRATIONS) {
        console.log(`  baseline: ${name}`);
        execSync(`npx prisma migrate resolve --applied "${name}"`, { stdio: "inherit" });
      }
      console.log("Baseline 완료.");
    } else {
      console.log("_prisma_migrations 테이블 존재 → baseline 생략.");
    }
  } finally {
    await client.end();
  }

  console.log("prisma migrate deploy 실행 중...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  console.log("마이그레이션 완료.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
