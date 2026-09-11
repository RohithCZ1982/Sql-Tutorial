import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminConsole } from "@/components/admin-console";

export const metadata = { title: "Admin — SQL Playground" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/account");

  const [users, sessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        accessDays: true,
        accessExpiresAt: true,
        statusNote: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { sessions: true, progress: true } },
      },
    }),
    prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        ipAddress: true,
        userAgent: true,
        playgroundSchema: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
  ]);

  return (
    <AdminConsole
      currentUserId={session.user.id}
      users={users.map((user) => ({
        ...user,
        accessExpiresAt: user.accessExpiresAt?.toISOString() ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      }))}
      sessions={sessions.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
      }))}
    />
  );
}
