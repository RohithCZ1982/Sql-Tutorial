# SQL Playground

An interactive course in SQL fundamentals. Ten modules take a beginner from
"what is a schema?" to indexes and `DELETE` vs `TRUNCATE`, and every idea comes
with SQL you can run immediately against a real Postgres database, the Prisma
equivalent beside it, and the mistakes people actually make.

Built with **Next.js (App Router) · Prisma · Postgres (Neon) · Tailwind CSS**.

---

## What is in it

**The course** — ten modules, each with: what it is, why it matters, the syntax,
a full working example, the Prisma equivalent, common mistakes, and a "try it"
editor pre-loaded with runnable examples.

| # | Module | Covers |
|---|--------|--------|
| 1 | What is a database schema? | server / database / schema / table, `search_path` |
| 2 | Default and system tables | `information_schema`, `pg_catalog`, how Prisma introspects |
| 3 | Creating tables and column types | `CREATE TABLE`, INT/TEXT/VARCHAR/BOOLEAN/TIMESTAMP/NUMERIC/JSONB |
| 4 | PRIMARY KEY and NOT NULL | surrogate vs natural keys, composite keys |
| 5 | UNIQUE, DEFAULT and CHECK | why `UNIQUE` allows many `NULL`s |
| 6 | FOREIGN KEY and referential actions | `ON DELETE` CASCADE / RESTRICT / SET NULL |
| 7 | Auto-increment | `SERIAL` vs `GENERATED ALWAYS AS IDENTITY` vs `@default(autoincrement())` |
| 8 | Indexes | covering, composite, partial, and reading `EXPLAIN ANALYZE` |
| 9 | INSERT, SELECT, UPDATE | `WHERE`, `ORDER BY`, `LIMIT`, `RETURNING` |
| 10 | DELETE vs TRUNCATE | speed, rollback, identity reset, triggers, locks |

**A live playground** — split view with the examples on the left, a CodeMirror
SQL editor on the right and results underneath. Every signed-in session gets its
own Postgres schema, so one learner dropping a table cannot disturb another.

**A schema visualizer** — reads the catalogs and shows your tables, columns,
keys, indexes and relationships as you build them.

**Accounts** — the course and the playground are for signed-in learners only.
Register, an administrator approves you and grants a number of access days, and
your progress is tracked per module. Only the landing page and the sign-in and
registration forms are public.

---

## Setting up Neon

1. Create a free project at [neon.tech](https://neon.tech).
2. Open **Dashboard → Connection Details**. You need **both** connection strings:
   - the **pooled** one (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one (no `-pooler`) → `DIRECT_URL`

   The app runs against the pooled endpoint; `prisma migrate` needs the direct
   one, because a transaction pooler cannot hold the session-level locks that
   migrations take.
3. Keep `?sslmode=require` on both.

Any Postgres works — Neon is not required. For local Postgres, point both
variables at the same instance.

## Configuration

```bash
cp .env.example .env
```

| Variable | What it is |
|----------|-----------|
| `DATABASE_URL` | Pooled connection. Used by the app at runtime. |
| `DIRECT_URL` | Direct connection. Used by `prisma migrate` and the seed script. |
| `SESSION_SECRET` | Mixed into session-token hashing and the guest cookie signature. Generate with `openssl rand -hex 32`. |
| `ADMIN_EMAIL` | The admin account the seed script creates. |
| `ADMIN_PASSWORD` | Its password. At least 10 characters; the seed refuses anything shorter. |

`.env` is gitignored. `.env.example` is committed.

## Running it locally

```bash
npm install
npm run db:migrate      # create the tables
npm run db:seed         # create the admin + two demo learners
npm run dev             # http://localhost:3000
```

Sign in at `/login` with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you configured.

The seed also creates two demo learners (password `Learner!2345`) so the admin
screen has something to show: one `PENDING`, one `APPROVED` with 30 days.

**Those two are skipped when `NODE_ENV=production`** — their password is printed
right here, so on a public deployment they would be a working login for anyone
who reads this file. Set `SEED_DEMO_USERS=true` to force them on a private
staging box.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then a production build |
| `npm start` | Serve the production build |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:seed` | Create the admin and demo users |
| `npm run db:studio` | Prisma Studio |
| `npm run test:sandbox` | Unit tests for the SQL sandbox, including bypass attempts |
| `npm run verify:content` | Runs **every** course example against the database |
| `npm test` | Both of the above |

`npm run verify:content` is worth knowing about: it executes all 51 SQL snippets
in the course and asserts that the ones which are *meant* to fail fail with the
expected error. If you edit a lesson, run it.

There is also an end-to-end check that drives a running server through the real
flows (guest playground, sandbox enforcement, registration, approval, expiry):

```bash
npm run build && npm start     # in one shell
npx tsx scripts/e2e.ts         # in another
```

---

## How accounts work

```
register  ──▶  PENDING  ──▶  admin approves + sets access days  ──▶  APPROVED
                  │                                                    │
                  └──▶ REJECTED                          access days run out
                                                                       │
                                                                       ▼
                                              login refused until an admin extends
```

- **Registration** creates a `PENDING` user who cannot sign in yet. The response
  is deliberately the same whether or not the address was already registered, so
  the form cannot be used to discover who has an account.
- **Approval** sets `accessExpiresAt = now + accessDays`. Entering `0` days
  grants unlimited access.
- **Expiry** is enforced on sign-in *and* on every request, so access ending
  logs the user out rather than waiting for their session to lapse.
- **Suspend / reject** immediately revokes every live session for that user.
- `/admin` lists all users with their status and remaining days, and has a
  second tab showing exactly who is signed in right now — last seen, IP, browser
  and their playground schema.
- `/account` is the same view for a single learner: their access window, their
  progress, and their own active sessions.

### What is public

| Route | Who can see it |
|---|---|
| `/`, `/login`, `/register` | Everyone — the landing page exists so people can find the sign-in |
| `/learn`, `/learn/[slug]` | Signed-in learners. Others are redirected to `/login?next=…` and land back where they were headed |
| `/playground`, `/schema` | Signed-in learners |
| `/api/playground/*` | Signed-in learners; `401` otherwise, and no schema is created for a rejected caller |
| `/admin`, `/api/admin/*` | Administrators only |

Passwords are hashed with **scrypt** from `node:crypto` (no native dependency to
compile). Session cookies hold a random 32-byte token; only its SHA-256 hash is
stored, so a database leak cannot be replayed as a set of live logins.

---

## How the playground is sandboxed

Learners type arbitrary SQL, which deserves care. There are four layers:

**1. A tokenizer, not a regex.** SQL is lexed properly — line comments, nestable
block comments, `''` escapes, `E''` backslash escapes, dollar-quoted blocks and
quoted identifiers — before any check runs. Naive regex over raw SQL is trivially
defeated by hiding a semicolon or a keyword inside a string literal.

**2. An allowlist.** Only `SELECT`, `WITH`, `VALUES`, `TABLE`, `INSERT`,
`UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`/`ALTER`/`DROP` of TABLE, INDEX, VIEW and
SEQUENCE, `COMMENT ON`, `EXPLAIN`, `ANALYZE <table>` and `SHOW <setting>` are
accepted. Everything else is refused by default.

**3. A denylist for the rest.** Privilege changes, role and database management,
`ALTER SYSTEM`, server-side code (`DO`, `CREATE FUNCTION`, `SECURITY DEFINER`),
filesystem reach (`COPY`, `pg_read_file`, large objects), `dblink`, credential
catalogs (`pg_authid`), the app's own `public` schema, other learners' schemas,
`pg_sleep`, transaction control and maintenance commands.

**4. Runtime limits.** Each session is pinned to its own schema via `search_path`,
with a 5s `statement_timeout`, a 3s `lock_timeout`, and results capped at 500
rows. Each statement runs in its own transaction, so `SET LOCAL` settings can
never leak to the next user of a pooled connection.

`npm run test:sandbox` covers all of this, including the smuggling attempts
(banned words inside string literals must be *allowed* as data; the same words as
real statements must be *blocked*).

**Be clear-eyed about what this is.** It is a teaching sandbox that stops
accidents and the obvious attacks, not a jail rated for hostile multi-tenant use.
If you expose this publicly, also:

- point it at a **dedicated database** that holds nothing else;
- connect as a **restricted role** that owns nothing outside its own schemas and
  has no `SUPERUSER`, no `CREATEROLE`, and no rights on `public`;
- put the app behind authentication and a rate limit.

Statements commit one at a time, deliberately: an example like "these two inserts
work, the third violates the constraint" has to leave the first two in place, or
the learner sees an error and an empty table and learns the wrong lesson.

---

## Project layout

```
app/
  api/
    auth/{register,login,logout,me}     sign-up, sign-in, session
    playground/{run,reset,schema}       execute SQL, reset, introspect
    admin/{users,sessions}              approvals and live sessions
    progress/                           per-module completion
  learn/[slug]/                         a module page
  playground/                           split-view playground
  schema/                               schema visualizer
  admin/  account/  login/  register/
components/                             UI (playground, editor, nav, admin)
lib/
  content/modules.ts                    the ten modules — all course text
  content/verify-examples.ts            runs every example against Postgres
  sql-sandbox.ts                        tokenizer + allowlist + denylist
  sql-sandbox.test.ts                   sandbox tests
  playground.ts                         execution, schema isolation, introspection
  auth.ts                               passwords, sessions, access windows
  db.ts  pg.ts                          Prisma client and raw pg pool
prisma/
  schema.prisma  migrations/  seed.ts
scripts/e2e.ts                          end-to-end check against a running server
```

Course content lives entirely in `lib/content/modules.ts`. Adding a module means
adding one object to that array — the list page, the module page, the playground's
example picker and the progress tracker all read from it.

## Deploying

### Render

A `render.yaml` blueprint is included — **New → Blueprint** picks it up and sets
everything below automatically. To configure a service by hand instead:

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Pre-deploy command | `npm run db:deploy` |
| Start command | `npm start` |
| Node version | `22.12.0` (or rely on the `engines` field) |

Then set the environment variables: `DATABASE_URL` (Neon **pooled**),
`DIRECT_URL` (Neon **direct**), `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

**Seed once after the first successful deploy**, from the Render Shell:

```bash
npm run db:seed
```

Until you do, no admin account exists and nobody can sign in.

Two Render defaults are worth knowing about, because both produce confusing
build failures:

- **`--include=dev` is not optional.** Render sets `NODE_ENV=production`, which
  makes npm skip devDependencies — but `next build` needs `typescript`,
  `tailwindcss` and the `prisma` CLI, all of which live there. Without the flag
  the build dies on `prisma: not found` in the postinstall hook, or on a missing
  Tailwind/TypeScript plugin.
- **Pin Node.** `engines` requires `>=22.12.0` (Next 16 needs ≥20.9, Prisma 7
  needs `^20.19 || ^22.12 || >=24`). If Render's default drifts below that, the
  failure message will not obviously point at the Node version.

On the free instance type there is no pre-deploy step, so fold the migration
into the build instead: `npm ci --include=dev && npm run db:deploy && npm run build`.
Free services also sleep after 15 minutes of inactivity, and a free Neon project
suspends its compute, so the first request after a quiet period is slow twice
over.

### Anywhere else

Works on any Node host. Set the same five environment variables, run
`npm run db:deploy` then `npm run db:seed` once, and start with `npm start`.
`npm run build` already runs `prisma generate`.

The playground creates a schema per session and never drops them automatically.
On a long-lived deployment, clean up periodically:

```sql
-- schemas whose session has gone
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'playground_%';
```

## Notes and limitations

- **Prisma 7** moved connection URLs out of `schema.prisma` into
  `prisma.config.ts` and requires a driver adapter (`@prisma/adapter-pg`). If you
  are following an older tutorial, that is why the schema has no `url`.
- Prisma has no `CHECK` constraint syntax and no partial-index syntax; both are
  noted in the relevant modules as things to add in a hand-edited migration.
- Old playground schemas are not garbage-collected.
- There is no email delivery, so approval is not notified — the learner finds out
  by trying to sign in.
