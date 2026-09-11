import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import type { Role, User, UserStatus } from "./generated/prisma/client";

// Password hashing lives in ./password so scripts outside Next (the seed, the
// end-to-end checks) can use the same implementation.
export { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "sqlplay_session";
const SESSION_DAYS = 7;

/* -------------------------------------------------------------------------
 * Sessions
 *
 * The cookie carries a random 32-byte token. Only its SHA-256 hash (salted
 * with SESSION_SECRET) is stored, so a leaked database cannot be replayed as
 * a set of live logins.
 * ---------------------------------------------------------------------- */

function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "status" | "accessExpiresAt" | "accessDays"
>;

export type ActiveSession = {
  id: string;
  user: SessionUser;
  playgroundSchema: string | null;
  expiresAt: Date;
};

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const requestHeaders = await headers();

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
      ipAddress:
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: requestHeaders.get("user-agent") ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return token;
}

/**
 * Resolve the current session, or null. Also enforces the access window: an
 * approved user whose access days have run out is treated as logged out.
 */
export async function getSession(): Promise<ActiveSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  const { user } = session;
  if (user.status !== "APPROVED") return null;
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
    return null;
  }

  // Keep the "who is logged in" view honest without writing on every request.
  const staleBy = Date.now() - session.lastSeenAt.getTime();
  if (staleBy > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    id: session.id,
    playgroundSchema: session.playgroundSchema,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      accessExpiresAt: user.accessExpiresAt,
      accessDays: user.accessDays,
    },
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Page-level gate for Server Components: send anyone without a valid session to
 * the login page, remembering where they were heading.
 *
 * `requireUser` below is the API-route equivalent — it throws AuthError instead,
 * because a route handler must answer 401 rather than redirect.
 */
export async function requirePageSession(returnTo?: string): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) {
    const target = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }
  return session;
}

export async function requireUser(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) throw new AuthError("You need to sign in to do that.", 401);
  return session;
}

export async function requireAdmin(): Promise<ActiveSession> {
  const session = await requireUser();
  if (session.user.role !== "ADMIN") {
    throw new AuthError("Administrator access is required.", 403);
  }
  return session;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------
 * Access window helpers
 * ---------------------------------------------------------------------- */

export function accessDaysRemaining(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function describeStatus(
  status: UserStatus,
  expiresAt: Date | null,
): { label: string; tone: "ok" | "warn" | "bad" } {
  if (status === "PENDING") return { label: "Awaiting approval", tone: "warn" };
  if (status === "REJECTED") return { label: "Rejected", tone: "bad" };
  if (status === "SUSPENDED") return { label: "Suspended", tone: "bad" };

  const remaining = accessDaysRemaining(expiresAt);
  if (remaining === null) return { label: "Approved", tone: "ok" };
  if (remaining === 0) return { label: "Access expired", tone: "bad" };
  if (remaining <= 3) return { label: `${remaining} day(s) left`, tone: "warn" };
  return { label: `${remaining} days left`, tone: "ok" };
}

export type { Role, UserStatus };
