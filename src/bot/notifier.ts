import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../lib/prisma";
import { getRecentMatches, getRankByPuuid } from "../lib/valorant";

const MATCH_INTERVAL = 5 * 60 * 1000;    // 5분
const RANK_INTERVAL  = 30 * 60 * 1000;   // 30분
const EVENT_INTERVAL = 60 * 1000;         // 1분 (일정 알림 체크)
const PATCH_INTERVAL = 6 * 3600 * 1000;  // 6시간

// 랭크 → 한국어 그룹 매핑 (rankRole tier 비교용)
const TIER_GROUP: Record<string, string> = {
  "아이언 1": "아이언", "아이언 2": "아이언", "아이언 3": "아이언",
  "브론즈 1": "브론즈", "브론즈 2": "브론즈", "브론즈 3": "브론즈",
  "실버 1": "실버", "실버 2": "실버", "실버 3": "실버",
  "골드 1": "골드", "골드 2": "골드", "골드 3": "골드",
  "플래티넘 1": "플래티넘", "플래티넘 2": "플래티넘", "플래티넘 3": "플래티넘",
  "다이아몬드 1": "다이아몬드", "다이아몬드 2": "다이아몬드", "다이아몬드 3": "다이아몬드",
  "초월자 1": "초월자", "초월자 2": "초월자", "초월자 3": "초월자",
  "불멸 1": "불멸", "불멸 2": "불멸", "불멸 3": "불멸",
  "레디언트": "레디언트",
};

export function startNotifier(client: Client) {
  console.log("🔔 알림 시스템 시작");
  setInterval(() => checkAllTracked(client), MATCH_INTERVAL);
  setInterval(() => checkRankUpdates(client), RANK_INTERVAL);
  setInterval(() => checkScheduledEvents(client), EVENT_INTERVAL);
  setInterval(() => checkPatchNotes(client), PATCH_INTERVAL);
  // 시작 즉시 1회
  setTimeout(() => checkPatchNotes(client), 5000);
}

// ─── 매치 알림 ───────────────────────────────────────────────
async function checkAllTracked(client: Client) {
  const guilds = await prisma.guild.findMany({
    where: { notifyChannelId: { not: null } },
    include: { trackedPlayers: true },
  });
  for (const guild of guilds) {
    for (const player of guild.trackedPlayers) {
      await checkPlayer(client, guild, player);
    }
  }
}

async function checkPlayer(client: Client, guild: any, player: any) {
  try {
    const matches = await getRecentMatches(player.riotPuuid, 1);
    if (!matches.length) return;
    const latest = matches[0];
    if (latest.matchId === player.lastMatchId) return;

    await prisma.trackedPlayer.update({ where: { id: player.id }, data: { lastMatchId: latest.matchId } });
    if (!player.lastMatchId) return;

    const channel = await client.channels.fetch(guild.notifyChannelId).catch(() => null);
    if (!channel || !(channel instanceof TextChannel)) return;

    const total = latest.headshots + latest.bodyshots + latest.legshots;
    const hs = total > 0 ? Math.round((latest.headshots / total) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(latest.result === "승리" ? 0x4ade80 : 0xff4655)
      .setTitle(`${latest.result === "승리" ? "✅" : "❌"} ${player.gameName}#${player.tagLine} — ${latest.result}`)
      .addFields(
        { name: "요원", value: latest.agent, inline: true },
        { name: "맵", value: latest.map, inline: true },
        { name: "KDA", value: `${latest.kills}/${latest.deaths}/${latest.assists}`, inline: true },
        { name: "헤드샷", value: `${hs}%`, inline: true },
      )
      .setTimestamp(latest.playedAt);

    await channel.send({ embeds: [embed] });

    // 출석 포인트 부여 (연동된 유저 확인)
    if (player.userId) {
      await giveAttendancePoints(player.userId, guild.id);
    }
  } catch (e) {
    console.error(`매치 알림 오류 [${player.gameName}]:`, e);
  }
}

async function giveAttendancePoints(userId: string, guildId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await prisma.pointTransaction.findFirst({
    where: { userId, guildId, type: "attendance", createdAt: { gte: new Date(today) } },
  });
  if (!existing) {
    await prisma.pointTransaction.create({
      data: { userId, guildId, amount: 10, reason: "오늘의 출석 보너스", type: "attendance" },
    });
  }
}

// ─── 랭크 업데이트 + 역할 자동 부여 ────────────────────────────
async function checkRankUpdates(client: Client) {
  const users = await prisma.user.findMany({
    where: { riotPuuid: { not: null } },
    include: { trackedBy: true },
  });

  for (const user of users) {
    if (!user.riotPuuid || !user.discordId) continue;
    try {
      const rank = await getRankByPuuid(user.riotPuuid);
      if (!rank) continue;

      const newTier = rank.tierName;
      const trackedPlayer = user.trackedBy[0];

      if (trackedPlayer && trackedPlayer.lastTier && trackedPlayer.lastTier !== newTier) {
        // 랭크 변동 알림
        const guild = await prisma.guild.findUnique({ where: { id: trackedPlayer.guildId } });
        if (guild?.notifyChannelId) {
          const channel = await client.channels.fetch(guild.notifyChannelId).catch(() => null);
          if (channel instanceof TextChannel) {
            const isUp = getRankValue(newTier) > getRankValue(trackedPlayer.lastTier);
            const embed = new EmbedBuilder()
              .setColor(isUp ? 0x4ade80 : 0xff4655)
              .setTitle(`${isUp ? "⬆️ 승급" : "⬇️ 강등"} — ${user.riotGameName}#${user.riotTagLine}`)
              .setDescription(`${trackedPlayer.lastTier} → **${newTier}**`)
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          }
        }
      }

      if (trackedPlayer) {
        await prisma.trackedPlayer.update({ where: { id: trackedPlayer.id }, data: { lastTier: newTier } });
      }

      // Discord 역할 자동 부여
      await assignRankRole(client, user.discordId, newTier);
    } catch {}
  }
}

function getRankValue(tier: string): number {
  const order = ["아이언", "브론즈", "실버", "골드", "플래티넘", "다이아몬드", "초월자", "불멸", "레디언트"];
  const group = TIER_GROUP[tier] ?? tier;
  return order.indexOf(group);
}

async function assignRankRole(client: Client, discordId: string, tierName: string) {
  const tierGroup = TIER_GROUP[tierName] ?? tierName;
  const guilds = await prisma.guild.findMany({ include: { rankRoles: true } });

  for (const guild of guilds) {
    if (!guild.rankRoles.length) continue;
    try {
      const discordGuild = await client.guilds.fetch(guild.discordId).catch(() => null);
      if (!discordGuild) continue;
      const member = await discordGuild.members.fetch(discordId).catch(() => null);
      if (!member) continue;

      const allRankRoleIds = guild.rankRoles.map((r) => r.roleId);
      const targetRole = guild.rankRoles.find((r) => r.tier === tierGroup);

      // 기존 랭크 역할 제거
      for (const roleId of allRankRoleIds) {
        if (member.roles.cache.has(roleId) && roleId !== targetRole?.roleId) {
          await member.roles.remove(roleId).catch(() => {});
        }
      }

      // 새 역할 부여
      if (targetRole && !member.roles.cache.has(targetRole.roleId)) {
        await member.roles.add(targetRole.roleId).catch(() => {});
      }
    } catch {}
  }
}

// ─── 내전 일정 30분 전 알림 ──────────────────────────────────
async function checkScheduledEvents(client: Client) {
  const soon = new Date(Date.now() + 31 * 60 * 1000);
  const now = new Date(Date.now() + 29 * 60 * 1000);

  const events = await prisma.scrimEvent.findMany({
    where: { scheduledAt: { gte: now, lte: soon }, notified: false },
    include: { guild: true },
  });

  for (const event of events) {
    if (!event.guild.notifyChannelId) continue;
    try {
      const channel = await client.channels.fetch(event.guild.notifyChannelId).catch(() => null);
      if (!(channel instanceof TextChannel)) continue;

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle("⏰ 내전 30분 전!")
        .setDescription(`**${event.title}** 이 30분 후에 시작됩니다!`)
        .setTimestamp(event.scheduledAt);

      if (event.description) embed.addFields({ name: "설명", value: event.description });

      await channel.send({ embeds: [embed] });
      await prisma.scrimEvent.update({ where: { id: event.id }, data: { notified: true } });
    } catch (e) {
      console.error("일정 알림 오류:", e);
    }
  }
}

// ─── 패치노트 크롤링 ──────────────────────────────────────────
let lastPatchUrl: string | null = null;

async function checkPatchNotes(client: Client) {
  try {
    const res = await fetch("https://www.valorant.com/ko-kr/news/patch-notes/");
    if (!res.ok) return;
    const html = await res.text();

    // og:url 메타 태그로 최신 패치노트 URL 추출
    const match = html.match(/\/ko-kr\/news\/patch-notes\/[a-z0-9-]+/);
    if (!match) return;

    const patchUrl = `https://www.valorant.com${match[0]}`;
    if (patchUrl === lastPatchUrl) return;
    lastPatchUrl = patchUrl;

    // 제목 추출
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(" - VALORANT", "").trim() : "새 패치노트";

    const guilds = await prisma.guild.findMany({ where: { notifyChannelId: { not: null } } });
    for (const guild of guilds) {
      try {
        const channel = await client.channels.fetch(guild.notifyChannelId!).catch(() => null);
        if (!(channel instanceof TextChannel)) continue;

        const embed = new EmbedBuilder()
          .setColor(0xff4655)
          .setTitle(`📋 ${title}`)
          .setDescription(`새 패치노트가 업로드됐어요!\n[패치노트 보기](${patchUrl})`)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch {}
    }
  } catch (e) {
    console.error("패치노트 크롤링 오류:", e);
  }
}
