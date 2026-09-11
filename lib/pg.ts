import { Pool } from "pg";

/**
 * A plain pg pool used only for the playground.
 *
 * The playground deliberately does NOT go through Prisma: learners type raw
 * SQL, and we want the real Postgres error text, notices and row shapes back
 * rather than anything an ORM has reinterpreted.
 */
const globalForPool = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Neon and most hosted Postgres require TLS; local dev usually does not.
    ssl: /\bsslmode=require\b/.test(connectionString)
      ? { rejectUnauthorized: true }
      : undefined,
  });
}

export const pool: Pool = globalForPool.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPool.pgPool = pool;
}
