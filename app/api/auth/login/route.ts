import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, accessDaysRemaining } from "@/lib/auth";

const schema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a hash comparison so a missing account and a wrong password
  // take a similar amount of time.
  const passwordOk = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyPassword(parsed.data.password, "scrypt$16384$8$1$00$00");

  if (!user || !passwordOk) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  if (user.status === "PENDING") {
    return NextResponse.json(
      { error: "Your account is still waiting for administrator approval.", status: "PENDING" },
      { status: 403 },
    );
  }
  if (user.status === "REJECTED") {
    return NextResponse.json(
      { error: user.statusNote ?? "Your registration was not approved.", status: "REJECTED" },
      { status: 403 },
    );
  }
  if (user.status === "SUSPENDED") {
    return NextResponse.json(
      { error: user.statusNote ?? "Your account is suspended.", status: "SUSPENDED" },
      { status: 403 },
    );
  }
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Your access period has ended. Ask an administrator to extend it.", status: "EXPIRED" },
      { status: 403 },
    );
  }

  await createSession(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
      daysRemaining: accessDaysRemaining(user.accessExpiresAt),
    },
  });
}
