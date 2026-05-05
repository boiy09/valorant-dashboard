import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@/lib/prisma";

type RiotRegion = "KR" | "AP";

type ResolveSuccess = {
  ok: true;
  target: {
    gameName: string;
    tagLine: string;
    region: RiotRegion;
    source: "manual" | "legacy" | "linked";
  };
};

type ResolveFailure = {
  ok: false;
  message: string;
};

async function findUser(discordId: string) {
  return prisma.user.findUnique({
    where: { discordId },
    include: {
      riotAccounts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function resolveLinkedRiotAccount(
  interaction: ChatInputCommandInteraction,
  options?: { riotIdOptionName?: string; regionOptionName?: string }
) {
  const riotIdOptionName = options?.riotIdOptionName ?? "라이엇아이디";
  const regionOptionName = options?.regionOptionName ?? "지역";
  const manualRiotId = interaction.options.getString(riotIdOptionName);
  const regionRaw = interaction.options.getString(regionOptionName)?.toUpperCase();
  const region: RiotRegion = regionRaw === "AP" ? "AP" : "KR";

  if (manualRiotId && manualRiotId.includes("#")) {
    const [gameName, tagLine] = manualRiotId.split("#");
    return { gameName: gameName.trim(), tagLine: tagLine.trim(), region, source: "manual" as const };
  }

  const user = await findUser(interaction.user.id);
  if (!user) {
    return { error: "디스코드 계정과 연결된 라이엇 계정이 없습니다. 대시보드에서 계정을 먼저 연결하거나 라이엇아이디 옵션을 직접 입력해 주세요." };
  }

  const accounts = user.riotAccounts ?? [];
  if (accounts.length === 0) {
    if (user.riotGameName && user.riotTagLine) {
      return { gameName: user.riotGameName, tagLine: user.riotTagLine, region, source: "legacy" as const };
    }
    return { error: "연결된 라이엇 계정이 없습니다. 대시보드에서 계정을 먼저 연결하거나 라이엇아이디 옵션을 직접 입력해 주세요." };
  }

  const selected = accounts.find(a => a.isPrimary) ?? accounts[0];
  if (!selected) {
    return { error: "연결된 라이엇 계정을 찾을 수 없습니다." };
  }

  return { gameName: selected.gameName, tagLine: selected.tagLine, region, source: "linked" as const };
}

export async function resolveRiotTarget(
  interaction: ChatInputCommandInteraction
): Promise<ResolveSuccess | ResolveFailure> {
  const resolved = await resolveLinkedRiotAccount(interaction);
  if ("error" in resolved) {
    return { ok: false, message: resolved.error ?? "알 수 없는 오류" };
  }
  return { ok: true, target: resolved };
}
