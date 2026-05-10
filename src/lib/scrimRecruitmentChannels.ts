const ALLOWED_RECRUITMENT_CHANNEL_NAMES = ["이벤트공지", "구인구직"];

export interface DiscordChannelInfo {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  position?: number;
}

export function normalizeDiscordChannelName(name: string) {
  return name.toLowerCase().replace(/[\s_\-・ㆍ]/g, "");
}

export function isAllowedRecruitmentChannelName(name: string) {
  const normalized = normalizeDiscordChannelName(name);
  return ALLOWED_RECRUITMENT_CHANNEL_NAMES.some((allowed) => normalized.includes(allowed));
}

export function isTextRecruitmentChannel(channel: DiscordChannelInfo) {
  return (channel.type === 0 || channel.type === 5) && isAllowedRecruitmentChannelName(channel.name);
}

export async function fetchDiscordChannel(channelId: string, token: string) {
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as DiscordChannelInfo;
}
