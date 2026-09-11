import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getSession } from "./auth";
import { ensureSchema, newPlaygroundSchema, isValidSchemaName } from "./playground";

const GUEST_COOKIE = "sqlplay_guest";

/**
 * Guests get a playground too, but their schema name lives in a cookie rather
 * than the database. The cookie is HMAC-signed so a visitor cannot edit it to
 * point at somebody else's schema — without the signature, any well-formed
 * name would be accepted and one guest could read another's tables.
 *
 * Two entry points, because Next.js only allows cookies to be written from a
 * Route Handler or Server Action:
 *
 *   readPlaygroundContext()  - safe anywhere, never writes. Returns null when
 *                              a guest has no schema yet.
 *   getPlaygroundContext()   - Route Handlers only; creates and assigns one.
 */
function sign(value: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", secret).update(value).digest("hex");
}

function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value), "hex");
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export type PlaygroundContext = {
  schema: string;
  isGuest: boolean;
  userId: string | null;
};

/** Read the guest cookie and return its schema if the signature checks out. */
async function readGuestSchema(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_COOKIE)?.value;
  if (!raw) return null;

  const [name, signature] = raw.split(".");
  if (!name || !signature) return null;
  if (!isValidSchemaName(name) || !verify(name, signature)) return null;
  return name;
}

/**
 * Resolve the playground for rendering. Never writes a cookie, so it is safe
 * to call from a Server Component. Returns null for a guest who has not run
 * anything yet — their schema is created on the first API call.
 */
export async function readPlaygroundContext(): Promise<PlaygroundContext | null> {
  const session = await getSession();

  if (session) {
    const schema = session.playgroundSchema;
    if (schema && isValidSchemaName(schema)) {
      await ensureSchema(schema);
      return { schema, isGuest: false, userId: session.user.id };
    }
    return null;
  }

  const guestSchema = await readGuestSchema();
  if (!guestSchema) return null;

  await ensureSchema(guestSchema);
  return { schema: guestSchema, isGuest: true, userId: null };
}

/**
 * Resolve the playground, creating and persisting a schema if there is none.
 * Only call this from a Route Handler — it may set a cookie.
 */
export async function getPlaygroundContext(): Promise<PlaygroundContext> {
  const session = await getSession();

  if (session) {
    let schema = session.playgroundSchema;
    if (!schema || !isValidSchemaName(schema)) {
      schema = newPlaygroundSchema();
      await prisma.session.update({
        where: { id: session.id },
        data: { playgroundSchema: schema },
      });
    }
    await ensureSchema(schema);
    return { schema, isGuest: false, userId: session.user.id };
  }

  const existing = await readGuestSchema();
  if (existing) {
    await ensureSchema(existing);
    return { schema: existing, isGuest: true, userId: null };
  }

  const schema = newPlaygroundSchema();
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE, `${schema}.${sign(schema)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  await ensureSchema(schema);
  return { schema, isGuest: true, userId: null };
}
