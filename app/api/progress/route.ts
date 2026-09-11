import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { moduleSlugs } from "@/lib/content/modules";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ completed: [] });

  const rows = await prisma.progress.findMany({
    where: { userId: session.user.id },
    select: { moduleSlug: true },
  });
  return NextResponse.json({ completed: rows.map((row) => row.moduleSlug) });
}

const schema = z.object({
  moduleSlug: z.string().max(120),
  completed: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to track progress." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !moduleSlugs.includes(parsed.data.moduleSlug)) {
    return NextResponse.json({ error: "Unknown module." }, { status: 400 });
  }

  const { moduleSlug, completed } = parsed.data;

  if (completed) {
    await prisma.progress.upsert({
      where: { userId_moduleSlug: { userId: session.user.id, moduleSlug } },
      update: {},
      create: { userId: session.user.id, moduleSlug },
    });
  } else {
    await prisma.progress.deleteMany({ where: { userId: session.user.id, moduleSlug } });
  }

  return NextResponse.json({ ok: true });
}
