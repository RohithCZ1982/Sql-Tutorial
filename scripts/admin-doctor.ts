/**
 * Works out why the admin cannot sign in, and optionally repairs it.
 *
 *   npm run admin:check     report only
 *   npm run admin:fix       normalise the email and reset the password from
 *                           ADMIN_PASSWORD
 *
 * Never prints a password or a hash.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword, verifyPassword } from "../lib/password";

const FIX = process.argv.includes("--fix");

function describeWhitespace(label: string, value: string): string | null {
  if (value !== value.trim()) {
    return `${label} has leading or trailing whitespace — a stray space from a paste counts as part of the value.`;
  }
  return null;
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("✗ Neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  const rawEmail = process.env.ADMIN_EMAIL;
  const rawPassword = process.env.ADMIN_PASSWORD;

  console.log("\nEnvironment");
  console.log(`  ADMIN_EMAIL     ${rawEmail ? `"${rawEmail}"` : "NOT SET"}`);
  console.log(`  ADMIN_PASSWORD  ${rawPassword ? `set, ${rawPassword.length} characters` : "NOT SET"}`);

  if (!rawEmail || !rawPassword) {
    console.error("\n✗ Both ADMIN_EMAIL and ADMIN_PASSWORD must be set.");
    process.exit(1);
  }

  const problems: string[] = [];
  const emailWhitespace = describeWhitespace("ADMIN_EMAIL", rawEmail);
  const passwordWhitespace = describeWhitespace("ADMIN_PASSWORD", rawPassword);
  if (emailWhitespace) problems.push(emailWhitespace);
  if (passwordWhitespace) problems.push(passwordWhitespace);

  const email = rawEmail.toLowerCase().trim();
  if (email !== rawEmail) {
    console.log(`  normalised to   "${email}"  (login lowercases what you type)`);
  }
  if (rawPassword.length < 10) {
    problems.push("ADMIN_PASSWORD is shorter than 10 characters; the seed refuses it.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log("\nDatabase");
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, status: true, accessExpiresAt: true, passwordHash: true },
  });

  if (admins.length === 0) {
    console.log("  no ADMIN user exists at all");
    problems.push("No admin account has been created — run `npm run db:seed`.");
  } else {
    for (const admin of admins) {
      const mismatchedCase = admin.email !== admin.email.toLowerCase();
      console.log(
        `  ${admin.email}  status=${admin.status}` +
          (mismatchedCase ? "  ← stored with capitals, login can never match it" : ""),
      );
      if (mismatchedCase) {
        problems.push(
          `The admin "${admin.email}" is stored with capital letters. Login lowercases the address, so it can never be found. Run \`npm run admin:fix\`.`,
        );
      }
    }
  }

  const exact = await prisma.user.findUnique({ where: { email } });

  console.log("\nChecks");
  if (!exact) {
    console.log(`  ✗ no user at "${email}"`);
    problems.push(`No user exists at "${email}".`);
  } else {
    console.log(`  ✓ user exists at "${email}"`);
    console.log(`  ${exact.role === "ADMIN" ? "✓" : "✗"} role is ${exact.role}`);
    console.log(`  ${exact.status === "APPROVED" ? "✓" : "✗"} status is ${exact.status}`);

    if (exact.role !== "ADMIN") problems.push("That user is not an ADMIN.");
    if (exact.status !== "APPROVED") problems.push(`That user's status is ${exact.status}, so login is refused.`);

    if (exact.accessExpiresAt && exact.accessExpiresAt.getTime() < Date.now()) {
      console.log(`  ✗ access expired at ${exact.accessExpiresAt.toISOString()}`);
      problems.push("That admin's access window has expired.");
    }

    const passwordOk = await verifyPassword(rawPassword, exact.passwordHash);
    console.log(`  ${passwordOk ? "✓" : "✗"} ADMIN_PASSWORD matches the stored hash`);
    if (!passwordOk) {
      problems.push(
        "The stored password does not match ADMIN_PASSWORD. The seed never overwrites an existing password — run `npm run admin:fix` to set it from the environment.",
      );
    }
  }

  if (FIX) {
    console.log("\nRepairing");

    // Fold any capitalised admin row onto the normalised address.
    for (const admin of admins) {
      const normalised = admin.email.toLowerCase().trim();
      if (normalised !== admin.email) {
        const clash = await prisma.user.findUnique({ where: { email: normalised } });
        if (clash && clash.id !== admin.id) {
          console.log(`  • "${admin.email}" clashes with an existing "${normalised}" — leaving it alone`);
          continue;
        }
        await prisma.user.update({ where: { id: admin.id }, data: { email: normalised } });
        console.log(`  • renamed "${admin.email}" → "${normalised}"`);
      }
    }

    const target = await prisma.user.findUnique({ where: { email } });
    if (target) {
      await prisma.user.update({
        where: { email },
        data: {
          role: "ADMIN",
          status: "APPROVED",
          accessExpiresAt: null,
          statusNote: null,
          passwordHash: await hashPassword(rawPassword),
        },
      });
      console.log(`  • reset password and ensured ADMIN/APPROVED for "${email}"`);
    } else {
      await prisma.user.create({
        data: {
          email,
          name: "Administrator",
          passwordHash: await hashPassword(rawPassword),
          role: "ADMIN",
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });
      console.log(`  • created admin "${email}"`);
    }

    console.log("\n✓ Done. Sign in at /login with ADMIN_EMAIL and ADMIN_PASSWORD.");
  } else if (problems.length > 0) {
    console.log("\nProblems found");
    for (const problem of problems) console.log(`  - ${problem}`);
    console.log("\nRun `npm run admin:fix` to repair all of the above.");
  } else {
    console.log("\n✓ Nothing wrong — those credentials should sign in.");
  }

  await prisma.$disconnect();
  process.exit(problems.length > 0 && !FIX ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
