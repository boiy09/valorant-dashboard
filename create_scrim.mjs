
import pg from 'pg';

const { Client } = pg;



const client = new Client({

  connectionString: "postgresql://valorant_app:Valorant2024App@127.0.0.1:5432/valorant_dashboard"

});



const participants = [

  { discordId: "356062237817044993", name: "정하" },

  { discordId: "384242265528467456", name: "ten" },

  { discordId: "626332767059312661", name: "김종욱" },

  { discordId: "751067802332299349", name: "제임스" },

  { discordId: "351262071834411030", name: "현우" },

  { discordId: "332842975598084096", name: "Aloe" },

  { discordId: "1174741453700874283", name: "슈링" },

  { discordId: "262052419033104384", name: "눈누" },

  { discordId: "412609325866156033", name: "ㄱㅈㅎ" },

  { discordId: "1476522091393187850", name: "용쿤" },

  { discordId: "281027074909536256", name: "WaterMelonKim" },

  { discordId: "567897538628157441", name: "밍부리" },

  { discordId: "615867133741760512", name: "주디확마" },

  { discordId: "869793908304007168", name: "토성" },

  { discordId: "171627828838662146", name: "simple" },

];



async function main() {

  await client.connect();

  console.log("DB 연결 성공");



  // 내전 세션 생성

  const scrimRes = await client.query(`

    INSERT INTO "ScrimSession" (id, title, mode, status, "scheduledAt", "channelId", "createdBy", "createdAt", "updatedAt")

    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())

    RETURNING id, title

  `, ["5/9 내전", "normal", "COMPLETED", "2026-05-09T13:06:00.000Z", "1343901277733781605", "281027074909536256"]);



  const scrimId = scrimRes.rows[0].id;

  console.log("내전 세션 생성:", scrimId, scrimRes.rows[0].title);



  // 참가자 등록

  for (const p of participants) {

    const userRes = await client.query(

      `SELECT id FROM "User" WHERE "discordId" = $1 LIMIT 1`,

      [p.discordId]

    );

    if (userRes.rows.length === 0) {

      console.log(`유저 없음 (skip): ${p.name} (${p.discordId})`);

      continue;

    }

    const userId = userRes.rows[0].id;

    await client.query(`

      INSERT INTO "ScrimPlayer" (id, "scrimId", "userId", team, "joinedAt")

      VALUES (gen_random_uuid(), $1, $2, NULL, NOW())

    `, [scrimId, userId]);

    console.log(`참가자 등록: ${p.name}`);

  }



  console.log("\n완료! 내전 ID:", scrimId);

  await client.end();

}



main().catch(e => { console.error(e); process.exit(1); });

