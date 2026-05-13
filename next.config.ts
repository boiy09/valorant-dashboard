import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    // Bot-only packages are excluded from Next.js bundle analysis.
    "discord.js",
    "@discordjs/builders",
    "@discordjs/collection",
    "@discordjs/formatters",
    "@discordjs/rest",
    "@discordjs/util",
    "@discordjs/ws",
    // Native database drivers should stay external to the web bundle.
    "pg",
    "pg-native",
    "@prisma/adapter-pg",
  ],
};

export default nextConfig;
