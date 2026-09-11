import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, AuthError } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
      approvedAt: true,
      approvedBy: { select: { email: true } },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json({ users });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    userId: z.string().min(1),
    /** 0 means unlimited access. */
    accessDays: z.number().int().min(0).max(3650),
  }),
  z.object({
    action: z.literal("extend"),
    userId: z.string().min(1),
    accessDays: z.number().int().min(1).max(3650),
  }),
  z.object({
    action: z.literal("reject"),
    userId: z.string().min(1),
    note: z.string().max(400).optional(),
  }),
  z.object({
    action: z.literal("suspend"),
    userId: z.string().min(1),
    note: z.string().max(400).optional(),
  }),
  z.object({ action: z.literal("reinstate"), userId: z.string().min(1) }),
  z.object({ action: z.literal("revokeSessions"), userId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That action is not valid." }, { status: 400 });
  }

  const input = parsed.data;
  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // An admin locking themselves out is an easy accident to prevent.
  if (target.id === admin.user.id && input.action !== "extend") {
    return NextResponse.json(
      { error: "You cannot change your own access from here." },
      { status: 400 },
    );
  }

  const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;

  switch (input.action) {
    case "approve": {
      const unlimited = input.accessDays === 0;
      await prisma.user.update({
        where: { id: target.id },
        data: {
          status: "APPROVED",
          accessDays: unlimited ? null : input.accessDays,
          accessExpiresAt: unlimited ? null : new Date(Date.now() + daysToMs(input.accessDays)),
          approvedAt: new Date(),
          approvedById: admin.user.id,
          statusNote: null,
        },
      });
      break;
    }
    case "extend": {
      // Extend from whichever is later: now, or the existing expiry. Extending
      // an already-expired account from "now" is what an admin expects.
      const base =
        target.accessExpiresAt && target.accessExpiresAt.getTime() > Date.now()
          ? target.accessExpiresAt.getTime()
          : Date.now();
      await prisma.user.update({
        where: { id: target.id },
        data: {
          status: "APPROVED",
          accessDays: input.accessDays,
          accessExpiresAt: new Date(base + daysToMs(input.accessDays)),
        },
      });
      break;
    }
    case "reject": {
      await prisma.user.update({
        where: { id: target.id },
        data: { status: "REJECTED", statusNote: input.note ?? null, accessExpiresAt: null },
      });
      await prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      break;
    }
    case "suspend": {
      await prisma.user.update({
        where: { id: target.id },
        data: { status: "SUSPENDED", statusNote: input.note ?? null },
      });
      await prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      break;
    }
    case "reinstate": {
      await prisma.user.update({
        where: { id: target.id },
        data: { status: "APPROVED", statusNote: null },
      });
      break;
    }
    case "revokeSessions": {
      await prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
