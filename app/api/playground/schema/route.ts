import { NextResponse } from "next/server";
import { describeSchema } from "@/lib/playground";
import { getPlaygroundContext } from "@/lib/playground-session";

export async function GET() {
  const context = await getPlaygroundContext();
  const tables = await describeSchema(context.schema);
  return NextResponse.json({ tables, schema: context.schema, isGuest: context.isGuest });
}
