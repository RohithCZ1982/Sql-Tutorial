import { NextResponse } from "next/server";
import { resetSchema } from "@/lib/playground";
import { getPlaygroundContext } from "@/lib/playground-session";

export async function POST() {
  const context = await getPlaygroundContext();
  await resetSchema(context.schema);
  return NextResponse.json({ ok: true, schema: context.schema });
}
