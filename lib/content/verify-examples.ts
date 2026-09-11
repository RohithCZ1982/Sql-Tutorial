/**
 * Runs every SQL snippet in the course against a real Postgres, in a throwaway
 * schema per snippet, and reports what happened.
 *
 * Some snippets are MEANT to fail — that is the lesson (a constraint refusing
 * bad data). Those are listed in EXPECTED_FAILURES with the error fragment we
 * expect, so an unexpected failure stands out from a teaching failure.
 *
 * Run with:  npm run verify:content
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pool } from "../pg";
import { runSql } from "../playground";
import { modules } from "./modules";

/** key = "<module slug>::<example label>", value = fragment of the expected error */
const EXPECTED_FAILURES: Record<string, string> = {
  "create-table::Watch a type reject bad data": "invalid input syntax for type integer",
  "primary-keys::Primary key blocks duplicates": "duplicate key value",
  "primary-keys::NOT NULL blocks missing values": "null value in column",
  "unique-default-check::UNIQUE rejects a duplicate": "duplicate key value",
  "unique-default-check::CHECK enforces a business rule": "violates check constraint",
  "foreign-keys::A bad reference is refused": "violates foreign key constraint",
  "foreign-keys::RESTRICT blocks the delete": "violates foreign key constraint",
  "auto-increment::IDENTITY refuses a manual id": "cannot insert a non-default value",
  // These module examples end on a deliberate failure to demonstrate the rule.
  "primary-keys::[example]": "null value in column",
  "primary-keys::Composite key": "duplicate key value",
  "foreign-keys::[example]": "violates foreign key constraint",
  "auto-increment::[example]": "null value in column",
  "crud::The NULL comparison trap": "null value in column",
  "delete-vs-truncate::TRUNCATE refuses while a foreign key points in":
    "cannot truncate a table referenced in a foreign key constraint",
};

/**
 * A few snippets only make sense after an earlier one in the same module has
 * run (for example "see the sequential scan" needs the table built first).
 * Listed here as the label of the snippet to run before it.
 */
const PREREQUISITES: Record<string, string[]> = {
  "indexes::See the sequential scan": ["Build a table worth indexing"],
  "indexes::Add the index and compare": ["Build a table worth indexing"],
  "indexes::Watch a function defeat the index": ["Build a table worth indexing"],
  "indexes::List the indexes you have": ["Build a table worth indexing"],
  "crud::Filter, sort, limit": ["Create and fill a table"],
  "crud::Preview before you update": ["Create and fill a table"],
  "crud::The NULL comparison trap": ["Create and fill a table"],
  "delete-vs-truncate::DELETE with a filter": ["Set up 1,000 rows"],
  "delete-vs-truncate::DELETE does not reset ids": ["Set up 1,000 rows"],
  "delete-vs-truncate::TRUNCATE ... RESTART IDENTITY does": ["Set up 1,000 rows"],
  "delete-vs-truncate::TRUNCATE refuses while a foreign key points in": ["Set up 1,000 rows"],
  "create-table::Watch a type reject bad data": ["Create the students table"],
  "create-table::Inspect what you built": ["Create the students table"],
};

let passed = 0;
let failed = 0;
const problems: string[] = [];

async function freshSchema(): Promise<string> {
  const schema = `playground_${randomBytes(8).toString("hex")}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    client.release();
  }
  return schema;
}

async function dropSchema(schema: string) {
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    client.release();
  }
}

async function check(key: string, sql: string, prereqSql: string[]) {
  const schema = await freshSchema();
  try {
    for (const prereq of prereqSql) {
      const setup = await runSql(schema, prereq);
      if (!setup.ok) {
        failed += 1;
        problems.push(`${key}\n    prerequisite failed: ${setup.error}`);
        console.log(`  FAIL  ${key} (prerequisite)`);
        return;
      }
    }

    const outcome = await runSql(schema, sql);
    const expectedError = EXPECTED_FAILURES[key];

    if (expectedError) {
      if (outcome.ok) {
        failed += 1;
        problems.push(`${key}\n    expected it to FAIL with "${expectedError}", but it succeeded`);
        console.log(`  FAIL  ${key} — expected a teaching error, got success`);
      } else if (!outcome.error.toLowerCase().includes(expectedError.toLowerCase())) {
        failed += 1;
        problems.push(`${key}\n    expected "${expectedError}"\n    actual   "${outcome.error}"`);
        console.log(`  FAIL  ${key} — wrong error`);
      } else {
        passed += 1;
        console.log(`  ok    ${key}  (fails as taught)`);
      }
      return;
    }

    if (!outcome.ok) {
      failed += 1;
      problems.push(`${key}\n    unexpected error: ${outcome.error}`);
      console.log(`  FAIL  ${key} — ${outcome.error}`);
    } else {
      passed += 1;
      const rows = outcome.results.reduce((sum, r) => sum + r.rows.length, 0);
      console.log(`  ok    ${key}  (${outcome.results.length} stmt, ${rows} rows)`);
    }
  } finally {
    await dropSchema(schema);
  }
}

async function main() {
  for (const module of modules) {
    console.log(`\n${module.title}`);

    // The main worked example for the module.
    await check(`${module.slug}::[example]`, module.example, []);

    for (const tryIt of module.tryIt) {
      const key = `${module.slug}::${tryIt.label}`;
      const prereqLabels = PREREQUISITES[key] ?? [];
      const prereqSql = prereqLabels.map((label) => {
        const found = module.tryIt.find((t) => t.label === label);
        if (!found) throw new Error(`Unknown prerequisite "${label}" for ${key}`);
        return found.sql;
      });
      await check(key, tryIt.sql, prereqSql);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (problems.length > 0) {
    console.log(`\nProblems:\n`);
    for (const problem of problems) console.log(`  - ${problem}\n`);
  }
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
