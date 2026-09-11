import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma and into this file.
 *
 * DATABASE_URL is the pooled connection used by the running app.
 * DIRECT_URL is a session-level connection; `prisma migrate` needs it because
 * a transaction pooler (Neon's "-pooler" host, pgBouncer) cannot run the
 * advisory locks and DDL that migrations rely on. Locally the two are the same.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
