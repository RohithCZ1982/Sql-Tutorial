import { NextResponse } from "next/server";
import { z } from "zod";
import { runSql } from "@/lib/playground";
import { getPlaygroundContext } from "@/lib/playground-session";

const schema = z.object({ sql: z.string().max(20_000) });

export async function POST(request: Request) {
  const context = await getPlaygroundContext();
  if (!context) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use the playground." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Send some SQL to run." }, { status: 400 });
  }

  const outcome = await runSql(context.schema, parsed.data.sql);

  // A rejected statement is a normal, expected teaching outcome, not an HTTP
  // error — the UI renders the database's message as part of the lesson.
  return NextResponse.json({ ...outcome, schema: context.schema });
}
