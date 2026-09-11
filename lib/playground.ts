import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./pg";
import { validateSql, returnsRows, SqlValidationError } from "./sql-sandbox";

/**
 * Every session gets its own Postgres schema, so one learner dropping a table
 * cannot disturb another. The schema name is derived from a random token, and
 * `search_path` is pinned to it for the duration of each request, which is why
 * learners can write plain `students` instead of a qualified name.
 */

const STATEMENT_TIMEOUT_MS = 5_000;
const MAX_ROWS_RETURNED = 500;

export function newPlaygroundSchema(): string {
  return `playground_${randomBytes(8).toString("hex")}`;
}

export function isValidSchemaName(name: string): boolean {
  return /^playground_[a-f0-9]{16}$/.test(name);
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Create the schema if it is missing. Safe to call on every request. */
export async function ensureSchema(schema: string): Promise<void> {
  if (!isValidSchemaName(schema)) {
    throw new Error(`Refusing to create suspicious schema name: ${schema}`);
  }
  await withClient(async (client) => {
    // Identifier cannot be parameterised; isValidSchemaName above is the guard.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  });
}

/** Drop everything in the schema and recreate it empty. */
export async function resetSchema(schema: string): Promise<void> {
  if (!isValidSchemaName(schema)) {
    throw new Error(`Refusing to reset suspicious schema name: ${schema}`);
  }
  await withClient(async (client) => {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);
  });
}

export type QueryResult = {
  statement: string;
  kind: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  command: string;
  durationMs: number;
};

export type RunOutcome =
  | { ok: true; results: QueryResult[]; totalMs: number }
  | {
      ok: false;
      error: string;
      detail?: string;
      hint?: string;
      statement?: string;
      position?: string;
      /** Statements that succeeded before the failure — their effects persist. */
      results?: QueryResult[];
    };

/**
 * Validate and run a batch of SQL, committing each statement separately.
 *
 * Each statement gets its own transaction, which is what psql does by default.
 * That matters for teaching: an example like "these two inserts work, the third
 * violates the constraint" has to actually leave the first two in place,
 * otherwise the learner sees an error and an empty table and learns the wrong
 * lesson. It also means SET LOCAL settings can never leak to the next user of
 * a pooled connection.
 */
export async function runSql(schema: string, sql: string): Promise<RunOutcome> {
  if (!isValidSchemaName(schema)) {
    return { ok: false, error: "Your playground session is invalid. Reset the playground to continue." };
  }

  let validated;
  try {
    validated = validateSql(sql, schema);
  } catch (error) {
    if (error instanceof SqlValidationError) {
      return { ok: false, error: error.message, statement: error.statement || undefined };
    }
    throw error;
  }

  const started = Date.now();

  return withClient(async (client): Promise<RunOutcome> => {
    const results: QueryResult[] = [];

    for (let index = 0; index < validated.statements.length; index += 1) {
      const statement = validated.statements[index];
      const statementStart = Date.now();

      try {
        await client.query("BEGIN");
        // Pin the search path so unqualified names resolve to this session's
        // schema only. pg_catalog is always searched implicitly by Postgres, so
        // built-in functions still work; information_schema stays reachable by
        // its explicit name, which the lessons rely on. SET LOCAL means these
        // die with the transaction and cannot leak to the next pooled user.
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await client.query("SET LOCAL lock_timeout = 3000");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = 10000");

        const result = await client.query(statement.raw);
        await client.query("COMMIT");

        const durationMs = Date.now() - statementStart;
        const wantsRows = returnsRows(statement.normalized);
        const allRows = Array.isArray(result.rows) ? result.rows : [];
        const rows = wantsRows ? allRows.slice(0, MAX_ROWS_RETURNED) : [];

        results.push({
          statement: statement.raw,
          kind: validated.kinds[index] ?? "SQL",
          columns: wantsRows ? (result.fields ?? []).map((field) => field.name) : [],
          rows,
          rowCount: typeof result.rowCount === "number" ? result.rowCount : allRows.length,
          truncated: wantsRows && allRows.length > MAX_ROWS_RETURNED,
          command: result.command ?? "",
          durationMs,
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);

        // pg errors carry the useful teaching detail: hint, position, constraint.
        const pgError = error as {
          message?: string;
          detail?: string;
          hint?: string;
          position?: string;
          code?: string;
        };

        let message = pgError.message ?? "The database rejected that statement.";
        if (pgError.code === "57014") {
          message = `Statement timed out after ${STATEMENT_TIMEOUT_MS / 1000}s. Try a smaller query.`;
        }

        // Statements before this one already committed; hand them back so the
        // learner sees what worked as well as what failed.
        return {
          ok: false,
          error: message,
          detail: pgError.detail,
          hint: pgError.hint,
          position: pgError.position,
          statement: statement.raw,
          results,
        };
      }
    }

    return { ok: true, results, totalMs: Date.now() - started };
  });
}

/* -------------------------------------------------------------------------
 * Schema introspection, used by the visualizer.
 * ---------------------------------------------------------------------- */

export type ColumnInfo = {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  foreignKey: { table: string; column: string; onDelete: string; onUpdate: string } | null;
};

export type TableInfo = {
  name: string;
  columns: ColumnInfo[];
  indexes: { name: string; definition: string; isUnique: boolean; isPrimary: boolean }[];
  rowCount: number;
};

export async function describeSchema(schema: string): Promise<TableInfo[]> {
  if (!isValidSchemaName(schema)) return [];

  return withClient(async (client) => {
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [schema],
    );

    const result: TableInfo[] = [];

    for (const { table_name: tableName } of tables.rows) {
      const columns = await client.query(
        `SELECT c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.is_nullable,
                c.column_default
           FROM information_schema.columns c
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position`,
        [schema, tableName],
      );

      const constraints = await client.query(
        `SELECT tc.constraint_type,
                kcu.column_name,
                ccu.table_name  AS foreign_table,
                ccu.column_name AS foreign_column,
                rc.delete_rule,
                rc.update_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
            AND tc.constraint_type = 'FOREIGN KEY'
      LEFT JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name
            AND rc.constraint_schema = tc.table_schema
          WHERE tc.table_schema = $1 AND tc.table_name = $2`,
        [schema, tableName],
      );

      const indexes = await client.query<{
        indexname: string;
        indexdef: string;
      }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
        [schema, tableName],
      );

      // Row counts are exact here on purpose: playground tables are tiny, and
      // an approximate count from pg_class would read as a bug to a learner.
      const counted = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${schema}"."${tableName}"`,
      );

      const primaryKeys = new Set(
        constraints.rows
          .filter((row) => row.constraint_type === "PRIMARY KEY")
          .map((row) => row.column_name),
      );
      const uniques = new Set(
        constraints.rows
          .filter((row) => row.constraint_type === "UNIQUE")
          .map((row) => row.column_name),
      );
      const foreignKeys = new Map(
        constraints.rows
          .filter((row) => row.constraint_type === "FOREIGN KEY")
          .map((row) => [
            row.column_name,
            {
              table: row.foreign_table as string,
              column: row.foreign_column as string,
              onDelete: (row.delete_rule as string) ?? "NO ACTION",
              onUpdate: (row.update_rule as string) ?? "NO ACTION",
            },
          ]),
      );

      result.push({
        name: tableName,
        rowCount: Number(counted.rows[0]?.count ?? 0),
        columns: columns.rows.map((column) => ({
          name: column.column_name as string,
          dataType: formatType(column),
          nullable: column.is_nullable === "YES",
          default: (column.column_default as string) ?? null,
          isPrimaryKey: primaryKeys.has(column.column_name as string),
          isUnique: uniques.has(column.column_name as string),
          foreignKey: foreignKeys.get(column.column_name as string) ?? null,
        })),
        indexes: indexes.rows.map((index) => ({
          name: index.indexname,
          definition: index.indexdef,
          isUnique: /CREATE UNIQUE INDEX/i.test(index.indexdef),
          isPrimary: index.indexname.endsWith("_pkey"),
        })),
      });
    }

    return result;
  });
}

function formatType(column: Record<string, unknown>): string {
  const type = String(column.data_type);
  const length = column.character_maximum_length as number | null;
  const precision = column.numeric_precision as number | null;
  const scale = column.numeric_scale as number | null;

  if (length) return `${type}(${length})`;
  if (type === "numeric" && precision) return `numeric(${precision},${scale ?? 0})`;
  return type;
}
