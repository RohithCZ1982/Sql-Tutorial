import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const schema = z.object({
  email: z.email("Enter a valid email address.").max(200),
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(200, "That password is too long."),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form and try again." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Do not reveal whether an address is registered: same message either way.
    return NextResponse.json({
      ok: true,
      message: "Thanks — if that address is new, an administrator will review it shortly.",
    });
  }

  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      status: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Thanks — if that address is new, an administrator will review it shortly.",
  });
}
