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
        orderBy: [{ region: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

function normalizeRegion(value: string | null | undefined): RiotRegion | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized === "KR") return "KR";
  if (normalized === "AP") return "AP";
  return null;
}

export async function resolveLinkedRiotAccount(
  interaction: ChatInputCommandInteraction,
  options?: {
    riotIdOptionName?: string;
    regionOptionName?: string;
  }
) {
  const riotIdOptionName = options?.riotIdOptionName ?? "라이엇아이디";
  const regionOptionName = options?.regionOptionName ?? "지역";

  const manualRiotId = interaction.options.getString(riotIdOptionName);
  const requestedRegion = normalizeRegion(interaction.options.getString(regionOptionName));

  if (manualRiotId && manualRiotId.includes("#")) {
    const [gameName, tagLine] = manualRiotId.split("#");
    return {
      gameName: gameName.trim(),
      tagLine: tagLine.trim(),
      region: requestedRegion ?? "KR",
      source: "manual" as const,
    };
  }

  const user = await findUser(interaction.user.id);
  if (!user) {
    return {
      error:
        "디스코드 계정과 연결된 라이엇 계정이 없습니다. 대시보드에서 KR/AP 계정을 먼저 연결하거나 라이엇아이디 옵션을 직접 입력해 주세요.",
    };
  }

  const accounts = user.riotAccounts ?? [];
  if (accounts.length === 0) {
    if (user.riotGameName && user.riotTagLine) {
      return {
        gameName: user.riotGameName,
        tagLine: user.riotTagLine,
        region: requestedRegion ?? "KR",
        source: "legacy" as const,
      };
    }

    return {
      error:
        "연결된 라이엇 계정이 없습니다. 대시보드에서 KR/AP 계정을 먼저 연결하거나 라이엇아이디 옵션을 직접 입력해 주세요.",
    };
  }

  const selected =
    (requestedRegion ? accounts.find((account) => account.region === requestedRegion) : null) ??
    accounts.find((account) => account.region === "KR") ??
    accounts.find((account) => account.region === "AP") ??
    accounts[0];

  if (!selected) {
    return {
      error:
        "선택한 지역에 연결된 라이엇 계정이 없습니다. 대시보드에서 계정을 연결하거나 라이엇아이디 옵션을 직접 입력해 주세요.",
    };
  }

  return {
    gameName: selected.gameName,
    tagLine: selected.tagLine,
    region: normalizeRegion(selected.region) ?? requestedRegion ?? "KR",
    source: "linked" as const,
  };
}

export async function resolveRiotTarget(
  interaction: ChatInputCommandInteraction
): Promise<ResolveSuccess | ResolveFailure> {
  const resolved = await resolveLinkedRiotAccount(interaction);
  if ("error" in resolved) {
    return { ok: false, message: resolved.error };
  }

  return {
    ok: true,
    target: resolved,
  };
}
