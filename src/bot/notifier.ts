import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../lib/prisma";
import { getRankByPuuid, getRecentMatches } from "../lib/valorant";

const MATCH_INTERVAL = 5 * 60 * 1000;
const RANK_INTERVAL = 30 * 60 * 1000;
const EVENT_INTERVAL = 60 * 1000;
const PATCH_INTERVAL = 6 * 60 * 60 * 1000;

const TIER_GROUP: Record<string, string> = {
  아이언1: "아이언",
  아이언2: "아이언",
  아이언3: "아이언",
  브론즈1: "브론즈",
  브론즈2: "브론즈",
  브론즈3: "브론즈",
  실버1: "실버",
  실버2: "실버",
  실버3: "실버",
  골드1: "골드",
  골드2: "골드",
  골드3: "골드",
  플래티넘1: "플래티넘",
  플래티넘2: "플래티넘",
  플래티넘3: "플래티넘",
  다이아몬드1: "다이아몬드",
  다이아몬드2: "다이아몬드",
  다이아몬드3: "다이아몬드",
  초월자1: "초월자",
  초월자2: "초월자",
  초월자3: "초월자",
  불멸1: "불멸",
  불멸2: "불멸",
  불멸3: "불멸",
  레디언트: "레디언트",
};

const TIER_ORDER = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "다이아몬드",
  "초월자",
  "불멸",
  "레디언트",
];

type TrackedPlayerRecord = {
  id: string;
  guildId: string;
  gameName: string;
  tagLine: string;
  riotPuuid: string;
  lastMatchId: string | null;
  lastTier: string | null;
  userId: string | null;
  region: string;
};

function normalizeRegion(region?: string | null): "kr" | "ap" {
  return region?.toUpperCase() === "AP" ? "ap" : "kr";
}

function regionLabel(region?: string | null) {
  return region?.toUpperCase() === "AP" ? "아섭(AP)" : "한섭(KR)";
}

function rankValue(tier: string) {
  const group = TIER_GROUP[tier] ?? tier;
  return TIER_ORDER.indexOf(group);
}

function buildMatchResultTitle(result: string) {
  if (result === "승리") return "승리";
  if (result === "패배") return "패배";
  return "무효";
}

export function startNotifier(client: Client) {
  console.log("알림 서비스 시작");

  setInterval(() => void checkAllTracked(client), MATCH_INTERVAL);
  setInterval(() => void checkRankUpdates(client), RANK_INTERVAL);
  setInterval(() => void checkScheduledEvents(client), EVENT_INTERVAL);
  setInterval(() => void checkPatchNotes(client), PATCH_INTERVAL);
  setTimeout(() => void checkPatchNotes(client), 5000);
}

async function checkAllTracked(client: Client) {
  const guilds = await prisma.guild.findMany({
    where: { notifyChannelId: { not: null } },
    include: { trackedPlayers: true },
  });

  for (const guild of guilds) {
    for (const player of guild.trackedPlayers) {
      await checkPlayer(client, guild, player as TrackedPlayerRecord);
    }
  }
}

async function checkPlayer(client: Client, guild: { id: string; notifyChannelId: string | null }, player: TrackedPlayerRecord) {
  try {
    const matches = await getRecentMatches(player.riotPuuid, 1, normalizeRegion(player.region));
    if (!matches.length) return;

    const latest = matches[0];
    if (latest.matchId === player.lastMatchId) return;

    await prisma.trackedPlayer.update({
      where: { id: player.id },
      data: { lastMatchId: latest.matchId },
    });

    if (!player.lastMatchId || !guild.notifyChannelId) return;

    const channel = await client.channels.fetch(guild.notifyChannelId).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const shots = latest.headshots + latest.bodyshots + latest.legshots;
    const headshotRate = shots > 0 ? Math.round((latest.headshots / shots) * 100) : 0;

    const embed = new EmbedBuilder()
      .setColor(latest.result === "승리" ? 0x4ade80 : latest.result === "패배" ? 0xff4655 : 0x94a3b8)
      .setTitle(`${buildMatchResultTitle(latest.result)} · ${player.gameName}#${player.tagLine}`)
      .addFields(
        { name: "지역", value: regionLabel(player.region), inline: true },
        { name: "요원", value: latest.agent, inline: true },
        { name: "맵", value: latest.map, inline: true },
        { name: "KDA", value: `${latest.kills}/${latest.deaths}/${latest.assists}`, inline: true },
        { name: "헤드샷률", value: `${headshotRate}%`, inline: true }
      )
      .setTimestamp(latest.playedAt);

    await channel.send({ embeds: [embed] });

    if (player.userId) {
      await giveAttendancePoints(player.userId, guild.id);
    }
  } catch (error) {
    console.error(`매치 알림 오류 [${player.gameName}#${player.tagLine}]:`, error);
  }
}

async function giveAttendancePoints(userId: string, guildId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.pointTransaction.findFirst({
    where: {
      userId,
      guildId,
      type: "attendance",
      createdAt: { gte: today },
    },
  });

  if (!existing) {
    await prisma.pointTransaction.create({
      data: {
        userId,
        guildId,
        amount: 10,
        reason: "일일 출석 보너스",
        type: "attendance",
      },
    });
  }
}

async function checkRankUpdates(client: Client) {
  const users = await prisma.user.findMany({
    include: { trackedBy: true, riotAccounts: true },
  });

  for (const user of users) {
    if (!user.discordId) continue;

    const trackedPlayer = user.trackedBy[0];
    const linkedAccount =
      (trackedPlayer
        ? user.riotAccounts.find((account) => account.puuid === trackedPlayer.riotPuuid)
        : null) ??
      user.riotAccounts.find((account) => account.region === "KR") ??
      user.riotAccounts[0] ??
      (user.riotPuuid
        ? {
            puuid: user.riotPuuid,
            gameName: user.riotGameName ?? "",
            tagLine: user.riotTagLine ?? "",
            region: "KR",
          }
        : null);

    if (!linkedAccount?.puuid) continue;

    try {
      const rank = await getRankByPuuid(linkedAccount.puuid, normalizeRegion(linkedAccount.region));
      if (!rank) continue;

      const newTier = rank.tierName;

      if (trackedPlayer?.lastTier && trackedPlayer.lastTier !== newTier) {
        const guild = await prisma.guild.findUnique({ where: { id: trackedPlayer.guildId } });

        if (guild?.notifyChannelId) {
          const channel = await client.channels.fetch(guild.notifyChannelId).catch(() => null);

          if (channel instanceof TextChannel) {
            const isUp = rankValue(newTier) > rankValue(trackedPlayer.lastTier);
            const embed = new EmbedBuilder()
              .setColor(isUp ? 0x4ade80 : 0xff4655)
              .setTitle(`${isUp ? "랭크 상승" : "랭크 하락"} · ${linkedAccount.gameName}#${linkedAccount.tagLine}`)
              .setDescription(`${trackedPlayer.lastTier} → **${newTier}**`)
              .addFields({ name: "지역", value: regionLabel(linkedAccount.region), inline: true })
              .setTimestamp();

            await channel.send({ embeds: [embed] });
          }
        }
      }

      if (trackedPlayer) {
        await prisma.trackedPlayer.update({
          where: { id: trackedPlayer.id },
          data: { lastTier: newTier },
        });
      }

      await assignRankRole(client, user.discordId, newTier);
    } catch (error) {
      console.error(`랭크 갱신 오류 [${linkedAccount.gameName}#${linkedAccount.tagLine}]:`, error);
    }
  }
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

      const allRankRoleIds = guild.rankRoles.map((role) => role.roleId);
      const targetRole = guild.rankRoles.find((role) => role.tier === tierGroup);

      for (const roleId of allRankRoleIds) {
        if (member.roles.cache.has(roleId) && roleId !== targetRole?.roleId) {
          await member.roles.remove(roleId).catch(() => {});
        }
      }

      if (targetRole && !member.roles.cache.has(targetRole.roleId)) {
        await member.roles.add(targetRole.roleId).catch(() => {});
      }
    } catch (error) {
      console.error("랭크 역할 동기화 오류:", error);
    }
  }
}

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
        .setTitle("일정 30분 전 알림")
        .setDescription(`**${event.title}** 일정이 30분 뒤에 시작됩니다.`)
        .setTimestamp(event.scheduledAt);

      if (event.description) {
        embed.addFields({ name: "설명", value: event.description });
      }

      await channel.send({ embeds: [embed] });
      await prisma.scrimEvent.update({
        where: { id: event.id },
        data: { notified: true },
      });
    } catch (error) {
      console.error("일정 알림 오류:", error);
    }
  }
}

let lastPatchUrl: string | null = null;

async function checkPatchNotes(client: Client) {
  try {
    const response = await fetch("https://www.valorant.com/ko-kr/news/patch-notes/");
    if (!response.ok) return;

    const html = await response.text();
    const match = html.match(/\/ko-kr\/news\/patch-notes\/[a-z0-9-]+/);
    if (!match) return;

    const patchUrl = `https://www.valorant.com${match[0]}`;
    if (patchUrl === lastPatchUrl) return;
    lastPatchUrl = patchUrl;

    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(" - VALORANT", "").trim() : "최신 패치노트";

    const guilds = await prisma.guild.findMany({
      where: { notifyChannelId: { not: null } },
    });

    for (const guild of guilds) {
      const channel = await client.channels.fetch(guild.notifyChannelId!).catch(() => null);
      if (!(channel instanceof TextChannel)) continue;

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle(`패치노트 · ${title}`)
        .setDescription(`새 패치노트가 등록되었습니다.\n[패치노트 보기](${patchUrl})`)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error("패치노트 확인 오류:", error);
  }
}
