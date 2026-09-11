import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/password";

/**
 * Seed: creates the admin account and a couple of demo learners so the admin
 * screen has something to show on first run.
 *
 * Safe to run repeatedly — every write is an upsert, and an existing admin's
 * password is never overwritten.
 */

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL (and ideally DIRECT_URL) before seeding.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  // Normalise exactly as the register and login routes do. Without this, an
  // ADMIN_EMAIL typed with any capital letter creates an account that login can
  // never find, because login lowercases what the user types.
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding — the admin account is created from them.",
    );
  }
  if (adminPassword.length < 10) {
    // Loud, because this is easy to scroll past in a deploy log and the symptom
    // it produces later ("email or password is incorrect") points somewhere else
    // entirely — no admin row was ever written.
    console.error("\n✗ ADMIN_PASSWORD is only " + adminPassword.length + " characters.");
    console.error("  It must be at least 10. NO ADMIN ACCOUNT HAS BEEN CREATED.");
    console.error("  Set a longer ADMIN_PASSWORD and run this again.\n");
    throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingAdmin) {
    // A password already in use is never silently replaced — set
    // ADMIN_PASSWORD_RESET=true to deliberately reset it from the environment.
    const resetPassword = process.env.ADMIN_PASSWORD_RESET === "true";

    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        role: "ADMIN",
        status: "APPROVED",
        accessExpiresAt: null,
        ...(resetPassword ? { passwordHash: await hashPassword(adminPassword) } : {}),
      },
    });

    console.log(
      resetPassword
        ? `✓ Admin password reset from ADMIN_PASSWORD: ${adminEmail}`
        : `✓ Admin already existed, ensured role/status: ${adminEmail}`,
    );
    if (!resetPassword) {
      console.log("  (its password was left alone — ADMIN_PASSWORD_RESET=true to change it)");
    }
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Administrator",
        passwordHash: await hashPassword(adminPassword),
        role: "ADMIN",
        status: "APPROVED",
        // Admins never expire.
        accessExpiresAt: null,
        approvedAt: new Date(),
      },
    });
    console.log(`✓ Created admin: ${adminEmail}`);
  }

  // Two demo learners so the admin screen is not empty on a fresh install:
  // one waiting for approval, one already approved with 30 days of access.
  //
  // NEVER in production: their password is published in the README, so on a
  // public deployment they would be a working login for anyone who reads it.
  // Set SEED_DEMO_USERS=true to force them anyway (a private staging box).
  const wantDemoUsers =
    process.env.SEED_DEMO_USERS === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_USERS !== "false");

  if (!wantDemoUsers) {
    console.log("• Skipped the demo learners (NODE_ENV=production).");
    console.log("  Set SEED_DEMO_USERS=true if you really want them.");
    console.log("\nSign in at /login");
    await prisma.$disconnect();
    return;
  }

  const demoPassword = await hashPassword("Learner!2345");

  await prisma.user.upsert({
    where: { email: "pending.learner@example.com" },
    update: {},
    create: {
      email: "pending.learner@example.com",
      name: "Priya (awaiting approval)",
      passwordHash: demoPassword,
      status: "PENDING",
    },
  });

  await prisma.user.upsert({
    where: { email: "active.learner@example.com" },
    update: {},
    create: {
      email: "active.learner@example.com",
      name: "Sam (approved)",
      passwordHash: demoPassword,
      status: "APPROVED",
      accessDays: 30,
      accessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      approvedAt: new Date(),
    },
  });

  console.log("✓ Created two demo learners (password: Learner!2345)");
  console.log("\nSign in at /login");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
