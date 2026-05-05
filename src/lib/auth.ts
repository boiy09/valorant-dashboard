import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify email guilds" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.discordId = profile.id as string;
        token.avatar = (profile as any).avatar;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.discordId as string;
      session.user.image = token.avatar
        ? `https://cdn.discordapp.com/avatars/${token.discordId}/${token.avatar}.png`
        : session.user.image;
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === "discord" && profile) {
        try {
          const { prisma } = await import("./prisma");
          const email = user.email ?? `${profile.id}@discord`;
          await prisma.user.upsert({
            where: { email },
            update: {
              name: user.name,
              image: user.image,
              discordId: profile.id as string,
            },
            create: {
              email,
              discordId: profile.id as string,
              name: user.name,
              image: user.image,
            },
          });
        } catch (e) {
          console.error(`유저 저장 오류 [discord:${profile.id}]:`, e);
          return false;
        }
      }
      return true;
    },
  },
  pages: { error: "/" },
});
