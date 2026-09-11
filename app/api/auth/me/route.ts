import { NextResponse } from "next/server";
import { getSession, accessDaysRemaining } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      daysRemaining: accessDaysRemaining(session.user.accessExpiresAt),
      accessExpiresAt: session.user.accessExpiresAt,
    },
  });
}
