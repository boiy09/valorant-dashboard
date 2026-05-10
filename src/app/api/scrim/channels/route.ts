import { getAdminSession } from "@/lib/admin";

export async function GET() {
  const { session, isAdmin, guild } = await getAdminSession();
  if (!session?.user?.id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isAdmin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!guild) return Response.json({ error: "서버 정보를 찾을 수 없습니다." }, { status: 404 });

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return Response.json({ error: "Discord bot token is missing." }, { status: 500 });

  const response = await fetch(`https://discord.com/api/v10/guilds/${guild.discordId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return Response.json({ error: `Discord channel list failed: ${response.status}` }, { status: 502 });

  const channels = (await response.json()) as Array<{
    id: string;
    name: string;
    type: number;
    parent_id?: string | null;
    position?: number;
  }>;

  const textChannels = channels
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parent_id ?? null,
    }));

  return Response.json({ channels: textChannels });
}
