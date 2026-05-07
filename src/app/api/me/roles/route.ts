import { getAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { roles, isAdmin } = await getAdminSession();
  return Response.json({ roles, isAdmin });
}
