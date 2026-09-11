import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, AuthError } from "@/lib/auth";

/** Who is signed in right now: live, unexpired, unrevoked sessions. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  const sessions = await prisma.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      playgroundSchema: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });

  return NextResponse.json({ sessions });
}
