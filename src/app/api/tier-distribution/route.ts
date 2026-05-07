import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRankByPuuid, type ValorantRegion } from "@/lib/valorant";

const REGION_LABELS = {
  KR: "한섭",
  AP: "아섭",
} as const;

const TIER_ORDER = [
  "UNRANKED",
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
  "ASCENDANT",
  "IMMORTAL",
  "RADIANT",
] as const;

const TIER_META: Record<(typeof TIER_ORDER)[number], { label: string; color: string }> = {
  UNRANKED: { label: "언랭크", color: "#64748b" },
  IRON: { label: "아이언", color: "#6b7280" },
  BRONZE: { label: "브론즈", color: "#b16a3a" },
  SILVER: { label: "실버", color: "#a8b3c7" },
  GOLD: { label: "골드", color: "#f3b33d" },
  PLATINUM: { label: "플래티넘", color: "#24c6b8" },
  DIAMOND: { label: "다이아몬드", color: "#b66dff" },
  ASCENDANT: { label: "초월자", color: "#22c55e" },
  IMMORTAL: { label: "불멸", color: "#e11d48" },
  RADIANT: { label: "레디언트", color: "#f8fafc" },
};

function toValorantRegion(region: string): ValorantRegion {
  return region.toUpperCase() === "AP" ? "ap" : "kr";
}

function normalizeTier(tierName: string | null | undefined): (typeof TIER_ORDER)[number] {
  const normalized = String(tierName ?? "").toLowerCase();

  if (normalized.includes("radiant") || normalized.includes("레디언트")) return "RADIANT";
  if (normalized.includes("immortal") || normalized.includes("불멸")) return "IMMORTAL";
  if (normalized.includes("ascendant") || normalized.includes("초월")) return "ASCENDANT";
  if (normalized.includes("diamond") || normalized.includes("다이아")) return "DIAMOND";
  if (normalized.includes("platinum") || normalized.includes("플래")) return "PLATINUM";
  if (normalized.includes("gold") || normalized.includes("골드")) return "GOLD";
  if (normalized.includes("silver") || normalized.includes("실버")) return "SILVER";
  if (normalized.includes("bronze") || normalized.includes("브론즈")) return "BRONZE";
  if (normalized.includes("iron") || normalized.includes("아이언")) return "IRON";
  return "UNRANKED";
}

async function settleInBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(task))));
  }
  return results;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const guildDiscordId = req.nextUrl.searchParams.get("guildId") ?? process.env.DISCORD_GUILD_ID;
  const guild = guildDiscordId
    ? await prisma.guild.findUnique({ where: { discordId: guildDiscordId } })
    : await prisma.guild.findFirst();

  if (!guild) {
    return Response.json({
      regions: buildEmptyRegions(),
      generatedAt: new Date().toISOString(),
    });
  }

  const accounts = await prisma.riotAccount.findMany({
    where: {
      region: { in: ["KR", "AP"] },
      user: { guilds: { some: { guildId: guild.id } } },
    },
    select: {
      puuid: true,
      gameName: true,
      tagLine: true,
      region: true,
    },
    orderBy: [{ region: "asc" }, { gameName: "asc" }],
  });

  const rankedAccounts = await settleInBatches(accounts, 3, async (account) => {
    const region = account.region.toUpperCase() === "AP" ? "AP" : "KR";
    const rank = await getRankByPuuid(account.puuid, toValorantRegion(region), {
      gameName: account.gameName,
      tagLine: account.tagLine,
    }).catch(() => null);

    return {
      region,
      tier: normalizeTier(rank?.tierName),
    };
  });

  const countsByRegion = {
    KR: Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0])) as Record<(typeof TIER_ORDER)[number], number>,
    AP: Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0])) as Record<(typeof TIER_ORDER)[number], number>,
  };

  for (const account of rankedAccounts) {
    countsByRegion[account.region as "KR" | "AP"][account.tier] += 1;
  }

  return Response.json({
    regions: {
      KR: buildRegion("KR", countsByRegion.KR),
      AP: buildRegion("AP", countsByRegion.AP),
    },
    generatedAt: new Date().toISOString(),
  });
}

function buildEmptyRegions() {
  return {
    KR: buildRegion("KR", Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0])) as Record<(typeof TIER_ORDER)[number], number>),
    AP: buildRegion("AP", Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0])) as Record<(typeof TIER_ORDER)[number], number>),
  };
}

function buildRegion(region: "KR" | "AP", counts: Record<(typeof TIER_ORDER)[number], number>) {
  const total = TIER_ORDER.reduce((sum, tier) => sum + counts[tier], 0);
  return {
    region,
    label: REGION_LABELS[region],
    total,
    tiers: TIER_ORDER.map((tier) => ({
      key: tier,
      label: TIER_META[tier].label,
      color: TIER_META[tier].color,
      count: counts[tier],
      percent: total > 0 ? Math.round((counts[tier] / total) * 1000) / 10 : 0,
    })),
  };
}
