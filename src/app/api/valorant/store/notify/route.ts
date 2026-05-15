import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

interface StoreItem {
  name: string;
  price: number;
  icon: string | null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { items, riotId, channelId } = body as {
    items: StoreItem[];
    riotId: string;
    channelId?: string;
  };

  const token = process.env.DISCORD_BOT_TOKEN;
  const targetChannelId = channelId ?? process.env.DISCORD_STORE_CHANNEL_ID;

  if (!token || !targetChannelId) {
    return Response.json({ error: "Discord 봇 설정이 없습니다. DISCORD_STORE_CHANNEL_ID 환경변수를 설정해주세요." }, { status: 400 });
  }

  if (!items?.length) return Response.json({ error: "상점 아이템이 없습니다." }, { status: 400 });

  const lines = [
    `🛒 **${riotId}** 오늘의 발로란트 상점`,
    "",
    ...items.map((item, i) => `${i + 1}. **${item.name}** — ${item.price.toLocaleString("ko-KR")} VP`),
    "",
    `<t:${Math.floor(Date.now() / 1000)}:R> 기준`,
  ];

  const res = await fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: lines.join("\n") }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `Discord 전송 실패: ${err}` }, { status: 500 });
  }

  return Response.json({ success: true });
}
