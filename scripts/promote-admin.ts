/**
 * Promote an already-registered user to administrator.
 *
 *   npm run admin:promote -- someone@example.com
 *   npm run admin:promote                          (uses ADMIN_EMAIL)
 *
 * Sets role=ADMIN and status=APPROVED with no access expiry. The user's
 * password is not touched — they keep the one they registered with, which is
 * the difference between this and `npm run admin:fix`.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("✗ Neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  const requested = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!requested) {
    console.error("✗ Give an email address, or set ADMIN_EMAIL.");
    console.error("  npm run admin:promote -- someone@example.com");
    process.exit(1);
  }

  // Accounts are stored lowercased, because login lowercases what is typed.
  const email = requested.toLowerCase().trim();
  if (email !== requested) {
    console.log(`Normalised "${requested}" → "${email}"`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`\n✗ No user registered at "${email}".`);
    const others = await prisma.user.findMany({
      select: { email: true, role: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (others.length > 0) {
      console.error("\n  Registered accounts:");
      for (const other of others) {
        console.error(`    ${other.email}  ${other.role}  ${other.status}`);
      }
    }
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\nBefore:  ${user.email}  role=${user.role}  status=${user.status}`);

  if (user.role === "ADMIN" && user.status === "APPROVED" && user.accessExpiresAt === null) {
    console.log("\n✓ Already an administrator with unlimited access. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: {
      role: "ADMIN",
      status: "APPROVED",
      accessExpiresAt: null, // administrators do not expire
      statusNote: null,
      approvedAt: user.approvedAt ?? new Date(),
    },
  });

  console.log(`After:   ${updated.email}  role=${updated.role}  status=${updated.status}  expires=never`);
  console.log("\n✓ Promoted. Their existing password still works — sign in at /login.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
