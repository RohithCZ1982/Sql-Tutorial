import { NextResponse } from "next/server";
import { describeSchema } from "@/lib/playground";
import { getPlaygroundContext } from "@/lib/playground-session";

export async function GET() {
  const context = await getPlaygroundContext();
  if (!context) {
    return NextResponse.json({ error: "Sign in to use the playground." }, { status: 401 });
  }

  const tables = await describeSchema(context.schema);
  return NextResponse.json({ tables, schema: context.schema });
}
