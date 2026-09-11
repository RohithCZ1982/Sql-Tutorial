import "server-only";
import { prisma } from "./db";
import { getSession } from "./auth";
import { ensureSchema, newPlaygroundSchema, isValidSchemaName } from "./playground";

/**
 * Each signed-in session gets its own Postgres schema, so one learner dropping
 * a table cannot disturb another.
 *
 * Two entry points, because Next.js only allows cookies and writes from a Route
 * Handler or Server Action:
 *
 *   readPlaygroundContext()  - safe anywhere, never writes. Null when the
 *                              session has no schema assigned yet.
 *   getPlaygroundContext()   - Route Handlers only; assigns one if missing.
 */
export type PlaygroundContext = {
  schema: string;
  userId: string;
};

/** For rendering. Never writes, so it is safe in a Server Component. */
export async function readPlaygroundContext(): Promise<PlaygroundContext | null> {
  const session = await getSession();
  if (!session) return null;

  const schema = session.playgroundSchema;
  if (!schema || !isValidSchemaName(schema)) return null;

  await ensureSchema(schema);
  return { schema, userId: session.user.id };
}

/**
 * Resolve the playground, creating a schema if the session has none.
 * Returns null when nobody is signed in — callers answer 401.
 */
export async function getPlaygroundContext(): Promise<PlaygroundContext | null> {
  const session = await getSession();
  if (!session) return null;

  let schema = session.playgroundSchema;
  if (!schema || !isValidSchemaName(schema)) {
    schema = newPlaygroundSchema();
    await prisma.session.update({
      where: { id: session.id },
      data: { playgroundSchema: schema },
    });
  }

  await ensureSchema(schema);
  return { schema, userId: session.user.id };
}
