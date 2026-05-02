import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActivityPageClient from "./ActivityPageClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  let user = await prisma.user.findUnique({ where: { discordId: session.user.id! } });
  if (!user && session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { discordId: session.user.id! } });
    }
  }

  return <ActivityPageClient />;
}
