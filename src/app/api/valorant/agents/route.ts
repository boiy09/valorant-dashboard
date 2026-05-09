interface ValorantApiAgent {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  fullPortrait: string | null;
  role: {
    uuid: string;
    displayName: string;
    displayIcon: string | null;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  Duelist: "타격대",
  Initiator: "척후대",
  Controller: "전략가",
  Sentinel: "감시자",
};

export async function GET() {
  const [enResponse, koResponse] = await Promise.all([
    fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US", {
      next: { revalidate: 60 * 60 * 24 },
    }),
    fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=ko-KR", {
      next: { revalidate: 60 * 60 * 24 },
    }),
  ]);

  if (!enResponse.ok || !koResponse.ok) {
    return Response.json({ error: "요원 정보를 불러오지 못했습니다." }, { status: 502 });
  }

  const [enPayload, koPayload] = await Promise.all([
    enResponse.json() as Promise<{ data?: ValorantApiAgent[] }>,
    koResponse.json() as Promise<{ data?: ValorantApiAgent[] }>,
  ]);
  const koById = new Map((koPayload.data ?? []).map((agent) => [agent.uuid, agent]));

  const agents = (enPayload.data ?? [])
    .filter((agent) => agent.displayName && agent.role?.displayName)
    .map((agent) => {
      const localized = koById.get(agent.uuid);
      const roleKey = agent.role?.displayName ?? "";

      return {
        id: agent.uuid,
        name: localized?.displayName ?? agent.displayName,
        icon: agent.displayIcon,
        portrait: localized?.fullPortrait ?? agent.fullPortrait,
        role: roleKey,
        roleLabel: ROLE_LABELS[roleKey] ?? roleKey,
        roleIcon: agent.role?.displayIcon ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));

  const roles = Array.from(
    new Map(
      agents.map((agent) => [
        agent.role,
        {
          role: agent.role,
          label: agent.roleLabel,
          icon: agent.roleIcon,
          count: agents.filter((item) => item.role === agent.role).length,
        },
      ])
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label, "ko"));

  return Response.json({ roles, agents });
}
