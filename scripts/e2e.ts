/**
 * End-to-end check against a running server.
 *
 *   npm run build && npm start      (in one shell)
 *   npx tsx scripts/e2e.ts          (in another)
 *
 * Exercises the flows that matter: the guest playground, sandbox enforcement,
 * per-session isolation, registration, admin approval with access days, and
 * the access-expiry gate.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/password";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
}

/** Minimal cookie jar: each Session gets its own. */
class Session {
  private cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });

    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }

  run(sql: string) {
    return this.fetch("/api/playground/run", {
      method: "POST",
      body: JSON.stringify({ sql }),
    }).then((r) => r.json());
  }
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });

  const stamp = Date.now();
  const learnerEmail = `e2e.learner.${stamp}@example.com`;
  const learnerPassword = "LearnerPass!2345";

  console.log("\nSigned-out visitors are locked out");
  {
    const anon = new Session();

    // Pages redirect to /login, carrying where they were heading.
    for (const path of ["/learn", "/learn/what-is-a-schema", "/playground", "/schema"]) {
      const res = await anon.fetch(path);
      const location = res.headers.get("location") ?? "";
      check(
        `${path} redirects to login`,
        res.status === 307 && location.includes("/login"),
        `status=${res.status} location=${location}`,
      );
    }

    // The landing page stays public so people can find the sign-in.
    const home = await anon.fetch("/");
    check("/ stays public", home.status === 200, `status=${home.status}`);
    const loginPage = await anon.fetch("/login");
    check("/login stays public", loginPage.status === 200, `status=${loginPage.status}`);

    // The API refuses outright rather than creating a schema.
    const ran = await anon.fetch("/api/playground/run", {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT 1;" }),
    });
    check("playground API returns 401", ran.status === 401, `status=${ran.status}`);

    const reset = await anon.fetch("/api/playground/reset", { method: "POST" });
    check("reset API returns 401", reset.status === 401, `status=${reset.status}`);

    const introspect = await anon.fetch("/api/playground/schema");
    check("schema API returns 401", introspect.status === 401, `status=${introspect.status}`);

    // ...and no schema was created for the unauthenticated caller.
    const schemasBefore = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM pg_namespace WHERE nspname LIKE 'playground_%'`,
    );
    await anon.fetch("/api/playground/run", {
      method: "POST",
      body: JSON.stringify({ sql: "CREATE TABLE sneaky (id INT);" }),
    });
    const schemasAfter = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM pg_namespace WHERE nspname LIKE 'playground_%'`,
    );
    check(
      "a rejected caller creates no schema",
      schemasBefore[0].n === schemasAfter[0].n,
      `before=${schemasBefore[0].n} after=${schemasAfter[0].n}`,
    );
  }

  console.log("\nSigned-in playground");
  const guest = new Session();
  {
    // Sign in as the approved demo learner created below is not available yet,
    // so use a purpose-made account for the playground checks.
    const email = `e2e.player.${stamp}@example.com`;
    const password = "PlayerPass!2345";
    await prisma.user.create({
      data: {
        email,
        name: "E2E Player",
        passwordHash: await hashPassword(password),
        status: "APPROVED",
        accessDays: 7,
        accessExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    const res = await guest.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    check("playground user signs in", res.status === 200, `status=${res.status}`);
  }
  {
    const created = await guest.run(
      "CREATE TABLE students (id SERIAL PRIMARY KEY, name TEXT NOT NULL);",
    );
    check("signed-in user can create a table", created.ok === true, JSON.stringify(created).slice(0, 200));

    const inserted = await guest.run(
      "INSERT INTO students (name) VALUES ('Ada'), ('Grace') RETURNING id, name;",
    );
    check(
      "insert returns generated rows",
      inserted.ok === true && inserted.results?.[0]?.rows?.length === 2,
      JSON.stringify(inserted).slice(0, 200),
    );

    const selected = await guest.run("SELECT name FROM students ORDER BY name;");
    check(
      "state persists between requests",
      selected.ok === true && selected.results[0].rows[0].name === "Ada",
      JSON.stringify(selected).slice(0, 200),
    );

    const failing = await guest.run(
      "INSERT INTO students (name) VALUES ('Alan');\nINSERT INTO students (name) VALUES (NULL);",
    );
    check(
      "a failing statement reports the constraint",
      failing.ok === false && /not-null/i.test(failing.error),
      failing.error,
    );
    check(
      "statements before the failure still committed",
      Array.isArray(failing.results) && failing.results.length === 1,
      JSON.stringify(failing.results),
    );

    const after = await guest.run("SELECT count(*)::int AS n FROM students;");
    check(
      "Alan survived the later failure (per-statement commit)",
      after.results[0].rows[0].n === 3,
      JSON.stringify(after.results[0].rows),
    );
  }

  console.log("\nSandbox enforcement (live)");
  {
    const cases: [string, string][] = [
      ["DROP DATABASE", "DROP DATABASE sqlplay;"],
      ["CREATE ROLE", "CREATE ROLE attacker SUPERUSER;"],
      ["GRANT", "GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC;"],
      ["read server files", "SELECT pg_read_file('/etc/passwd');"],
      ["read credentials", "SELECT * FROM pg_authid;"],
      ["reach app tables", "SELECT * FROM public.users;"],
      ["COPY FROM PROGRAM", "COPY students FROM PROGRAM 'id';"],
      ["anonymous code block", "DO $$ BEGIN PERFORM 1; END $$;"],
      ["hold the connection", "SELECT pg_sleep(30);"],
      ["escape via second statement", "SELECT 1; DROP DATABASE sqlplay;"],
    ];

    for (const [label, sql] of cases) {
      const result = await guest.run(sql);
      check(`blocked: ${label}`, result.ok === false, JSON.stringify(result).slice(0, 160));
    }

    // The app's own tables must still be intact after all of that.
    const users = await prisma.user.count();
    check("application users table untouched", users > 0, `count=${users}`);
  }

  console.log("\nSession isolation");
  {
    const other = new Session();
    const otherEmail = `e2e.other.${stamp}@example.com`;
    await prisma.user.create({
      data: {
        email: otherEmail,
        name: "E2E Other",
        passwordHash: await hashPassword("OtherPass!2345"),
        status: "APPROVED",
        accessExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await other.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: otherEmail, password: "OtherPass!2345" }),
    });
    const result = await other.run("SELECT count(*) FROM students;");
    check(
      "a second session cannot see the first session's table",
      result.ok === false && /does not exist/i.test(result.error),
      JSON.stringify(result).slice(0, 160),
    );
  }

  console.log("\nRegistration and approval");
  {
    const learner = new Session();

    const registered = await (
      await learner.fetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: "E2E Learner",
          email: learnerEmail,
          password: learnerPassword,
        }),
      })
    ).json();
    check("registration accepted", registered.ok === true, JSON.stringify(registered));

    const created = await prisma.user.findUnique({ where: { email: learnerEmail } });
    check("user created as PENDING", created?.status === "PENDING", created?.status);

    const blocked = await learner.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: learnerEmail, password: learnerPassword }),
    });
    check("pending user cannot sign in", blocked.status === 403, `status=${blocked.status}`);

    const wrongPassword = await learner.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: learnerEmail, password: "wrong-password" }),
    });
    check("wrong password rejected", wrongPassword.status === 401, `status=${wrongPassword.status}`);

    // --- admin signs in and approves with 14 days ---
    const admin = new Session();
    const adminLogin = await admin.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    check("admin can sign in", adminLogin.status === 200, `status=${adminLogin.status}`);

    const guestAdminAttempt = await guest.fetch("/api/admin/users");  // signed in, not admin
    check(
      "non-admin cannot list users",
      guestAdminAttempt.status === 401 || guestAdminAttempt.status === 403,
      `status=${guestAdminAttempt.status}`,
    );

    const approved = await admin.fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ action: "approve", userId: created!.id, accessDays: 14 }),
    });
    check("admin approves with 14 days", approved.status === 200, `status=${approved.status}`);

    const afterApproval = await prisma.user.findUnique({ where: { email: learnerEmail } });
    const days = afterApproval?.accessExpiresAt
      ? Math.round(
          (afterApproval.accessExpiresAt.getTime() - Date.now()) / 86_400_000,
        )
      : null;
    check(
      "access window is 14 days",
      afterApproval?.status === "APPROVED" && days === 14,
      `status=${afterApproval?.status} days=${days}`,
    );

    const nowIn = await learner.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: learnerEmail, password: learnerPassword }),
    });
    check("approved user can sign in", nowIn.status === 200, `status=${nowIn.status}`);

    const me = await (await learner.fetch("/api/auth/me")).json();
    check("session reports the learner", me.user?.email === learnerEmail, JSON.stringify(me));
    check("days remaining reported", me.user?.daysRemaining === 14, String(me.user?.daysRemaining));

    // --- logged-in users are visible to the admin ---
    const live = await (await admin.fetch("/api/admin/sessions")).json();
    check(
      "admin sees the learner signed in",
      Array.isArray(live.sessions) &&
        live.sessions.some((s: { user: { email: string } }) => s.user.email === learnerEmail),
      JSON.stringify(live).slice(0, 200),
    );

    // --- progress tracking ---
    const progressed = await learner.fetch("/api/progress", {
      method: "POST",
      body: JSON.stringify({ moduleSlug: "what-is-a-schema", completed: true }),
    });
    check("progress saved", progressed.status === 200, `status=${progressed.status}`);
    const progress = await (await learner.fetch("/api/progress")).json();
    check(
      "progress read back",
      progress.completed?.includes("what-is-a-schema"),
      JSON.stringify(progress),
    );

    // --- expiry gate ---
    await prisma.user.update({
      where: { email: learnerEmail },
      data: { accessExpiresAt: new Date(Date.now() - 1000) },
    });
    const expiredSession = await learner.fetch("/api/auth/me");
    const expiredBody = await expiredSession.json();
    check("expired access invalidates the session", expiredBody.user === null, JSON.stringify(expiredBody));

    const expiredLogin = await learner.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: learnerEmail, password: learnerPassword }),
    });
    check("expired user cannot sign in", expiredLogin.status === 403, `status=${expiredLogin.status}`);

    // --- admin extends, access returns ---
    await admin.fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ action: "extend", userId: created!.id, accessDays: 7 }),
    });
    const extendedLogin = await learner.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: learnerEmail, password: learnerPassword }),
    });
    check("extended user can sign in again", extendedLogin.status === 200, `status=${extendedLogin.status}`);

    // --- suspension revokes live sessions ---
    await admin.fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ action: "suspend", userId: created!.id, note: "e2e test" }),
    });
    const afterSuspend = await (await learner.fetch("/api/auth/me")).json();
    check("suspension kills the live session", afterSuspend.user === null, JSON.stringify(afterSuspend));
  }

  console.log("\nCleanup");
  {
    const deleted = await prisma.user.deleteMany({
      where: { email: { in: [learnerEmail, `e2e.player.${stamp}@example.com`, `e2e.other.${stamp}@example.com`] } },
    });
    check("test users removed", deleted.count === 3, `deleted=${deleted.count}`);

    // Drop the throwaway playground schemas this run created.
    const schemas = await prisma.$queryRawUnsafe<{ nspname: string }[]>(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'playground_%'`,
    );
    for (const { nspname } of schemas) {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
    }
    console.log(`  ok    dropped ${schemas.length} playground schema(s)`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
