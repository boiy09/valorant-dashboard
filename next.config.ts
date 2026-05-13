import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    // 봇 전용 — Next.js 번들 분석 대상에서 제외
    "discord.js",
    "@discordjs/builders",
    "@discordjs/collection",
    "@discordjs/formatters",
    "@discordjs/rest",
    "@discordjs/util",
    "@discordjs/ws",
    // DB 드라이버 — 네이티브 바이너리, 번들링 불필요
    "pg",
    "pg-native",
    "@prisma/adapter-pg",
  ],
};

export default nextConfig;
