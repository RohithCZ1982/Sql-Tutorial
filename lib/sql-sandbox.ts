/**
 * SQL sandbox for the learning playground.
 *
 * Learners type arbitrary SQL, so every statement is tokenized, split and
 * checked before it reaches Postgres. The tokenizer exists because naive regex
 * over raw SQL is trivially defeated: a semicolon or a banned keyword hidden
 * inside a string literal, a dollar-quoted block or a comment would either
 * split a statement in the wrong place or hide a banned word from the filter.
 *
 * The checks here are ONE layer. The README documents the others (a dedicated
 * database, a restricted role, per-session schemas, statement timeouts) and is
 * explicit that this is a teaching sandbox, not a hostile-multi-tenant jail.
 */

export type SqlStatement = {
  /** Exactly what the learner wrote, executed verbatim. */
  raw: string;
  /**
   * Lowercased, comment-free, with string/dollar-quote bodies replaced by a
   * placeholder. Only used for the keyword checks below, never executed.
   */
  normalized: string;
};

export class SqlValidationError extends Error {
  readonly statement: string;
  constructor(message: string, statement = "") {
    super(message);
    this.name = "SqlValidationError";
    this.statement = statement;
  }
}

/**
 * Split SQL into statements, tracking Postgres lexical structure:
 * line comments, nestable block comments, single-quoted strings (with ''
 * escapes), E'' strings with backslash escapes, dollar-quoted blocks with
 * arbitrary tags, and double-quoted identifiers.
 */
export function tokenizeSql(input: string): SqlStatement[] {
  const statements: SqlStatement[] = [];

  let raw = "";
  let normalized = "";
  let i = 0;

  const pushStatement = () => {
    const trimmedRaw = raw.trim();
    const trimmedNormalized = normalized.trim().replace(/\s+/g, " ").toLowerCase();
    // A fragment that normalizes to nothing is comments/whitespace only, such
    // as a trailing "-- note" after the last semicolon. It is a no-op, so drop
    // it rather than failing the whole batch on it.
    if (trimmedRaw.length > 0 && trimmedNormalized.length > 0) {
      statements.push({ raw: trimmedRaw, normalized: trimmedNormalized });
    }
    raw = "";
    normalized = "";
  };

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    // ---- line comment -------------------------------------------------
    if (ch === "-" && next === "-") {
      const end = input.indexOf("\n", i);
      const stop = end === -1 ? input.length : end;
      raw += input.slice(i, stop);
      normalized += " ";
      i = stop;
      continue;
    }

    // ---- block comment (nestable in Postgres) -------------------------
    if (ch === "/" && next === "*") {
      let depth = 0;
      const start = i;
      while (i < input.length) {
        if (input[i] === "/" && input[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (input[i] === "*" && input[i + 1] === "/") {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else {
          i += 1;
        }
      }
      raw += input.slice(start, i);
      normalized += " ";
      continue;
    }

    // ---- dollar-quoted string: $tag$ ... $tag$ -------------------------
    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*\$|^\$\$/.exec(
        input.slice(i),
      );
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeAt = input.indexOf(tag, i + tag.length);
        const stop = closeAt === -1 ? input.length : closeAt + tag.length;
        raw += input.slice(i, stop);
        normalized += " 'literal' ";
        i = stop;
        continue;
      }
    }

    // ---- single-quoted string (handles '' escape and E'' backslashes) ---
    if (ch === "'") {
      // Is this an E'...' / e'...' string? Look back one character.
      const prevChar = raw.length > 0 ? raw[raw.length - 1] : "";
      const backslashEscapes = prevChar === "E" || prevChar === "e";
      const start = i;
      i += 1;
      while (i < input.length) {
        if (backslashEscapes && input[i] === "\\") {
          i += 2;
          continue;
        }
        if (input[i] === "'") {
          if (input[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      raw += input.slice(start, i);
      normalized += " 'literal' ";
      continue;
    }

    // ---- double-quoted identifier -------------------------------------
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < input.length) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      const identifier = input.slice(start, i);
      raw += identifier;
      // Quoted identifiers stay visible to the checks: "pg_authid" must not
      // become a way to slip past the banned-token list.
      normalized += identifier.slice(1, -1).replace(/""/g, '"').toLowerCase();
      continue;
    }

    // ---- statement separator ------------------------------------------
    if (ch === ";") {
      pushStatement();
      i += 1;
      continue;
    }

    raw += ch;
    normalized += ch;
    i += 1;
  }

  pushStatement();
  return statements;
}

/**
 * Statements a learner is allowed to run, keyed by the leading keyword(s).
 * Anything not matched here is refused, so the default is "deny".
 */
const ALLOWED_STATEMENT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /^select\b/, label: "SELECT" },
  { pattern: /^with\b/, label: "WITH" },
  { pattern: /^values\b/, label: "VALUES" },
  { pattern: /^table\b/, label: "TABLE" },
  { pattern: /^insert\s+into\b/, label: "INSERT" },
  { pattern: /^update\b/, label: "UPDATE" },
  { pattern: /^delete\s+from\b/, label: "DELETE" },
  { pattern: /^truncate\b/, label: "TRUNCATE" },
  { pattern: /^create\s+(unlogged\s+)?(temp\s+|temporary\s+)?table\b/, label: "CREATE TABLE" },
  { pattern: /^create\s+(unique\s+)?index\b/, label: "CREATE INDEX" },
  { pattern: /^create\s+(or\s+replace\s+)?view\b/, label: "CREATE VIEW" },
  { pattern: /^create\s+sequence\b/, label: "CREATE SEQUENCE" },
  { pattern: /^alter\s+table\b/, label: "ALTER TABLE" },
  { pattern: /^alter\s+sequence\b/, label: "ALTER SEQUENCE" },
  { pattern: /^alter\s+index\b/, label: "ALTER INDEX" },
  { pattern: /^drop\s+table\b/, label: "DROP TABLE" },
  { pattern: /^drop\s+index\b/, label: "DROP INDEX" },
  { pattern: /^drop\s+view\b/, label: "DROP VIEW" },
  { pattern: /^drop\s+sequence\b/, label: "DROP SEQUENCE" },
  { pattern: /^comment\s+on\b/, label: "COMMENT ON" },
  { pattern: /^explain\b/, label: "EXPLAIN" },
  // ANALYZE <table> refreshes planner statistics, which the indexing module
  // needs to show a realistic plan. A bare ANALYZE (whole database) is not
  // matched here on purpose — see BANNED_TOKENS.
  { pattern: /^analyze\s+[a-z_"]/, label: "ANALYZE" },
  // SHOW <setting> is read-only and the schema lesson uses it to display the
  // search_path. Bare "SHOW ALL" is excluded by requiring a parameter name.
  { pattern: /^show\s+[a-z_][a-z0-9_.]*\s*$/, label: "SHOW" },
];

/**
 * Tokens refused anywhere in a statement. These cover privilege escalation,
 * reading the server's filesystem, reaching other databases, running code,
 * and anything that would outlive or escape the learner's own schema.
 *
 * String bodies are already replaced with a placeholder by the tokenizer, so a
 * banned word appearing inside a literal (for example inserting the text
 * 'grant') does not trip these.
 */
const BANNED_TOKENS: { pattern: RegExp; reason: string }[] = [
  // Privileges and roles
  { pattern: /\bgrant\b/, reason: "changing privileges is not allowed" },
  { pattern: /\brevoke\b/, reason: "changing privileges is not allowed" },
  { pattern: /\breassign\b/, reason: "changing ownership is not allowed" },
  { pattern: /\bset\s+role\b/, reason: "changing role is not allowed" },
  { pattern: /\breset\s+role\b/, reason: "changing role is not allowed" },
  { pattern: /\bset\s+session\s+authorization\b/, reason: "changing session authorization is not allowed" },
  { pattern: /\b(create|alter|drop)\s+(role|user|group)\b/, reason: "managing roles is not allowed" },

  // Server-wide or database-wide objects
  { pattern: /\balter\s+system\b/, reason: "ALTER SYSTEM changes server configuration" },
  { pattern: /\b(create|alter|drop)\s+database\b/, reason: "managing databases is not allowed" },
  { pattern: /\b(create|alter|drop)\s+schema\b/, reason: "your playground schema is managed for you" },
  { pattern: /\b(create|alter|drop)\s+tablespace\b/, reason: "managing tablespaces is not allowed" },
  { pattern: /\b(create|alter|drop)\s+extension\b/, reason: "managing extensions is not allowed" },
  { pattern: /\b(create|alter|drop)\s+(server|publication|subscription)\b/, reason: "replication and foreign servers are not allowed" },
  { pattern: /\bforeign\s+(data\s+wrapper|table)\b/, reason: "foreign data wrappers are not allowed" },
  { pattern: /\bdrop\s+owned\b/, reason: "DROP OWNED is not allowed" },
  { pattern: /\balter\s+default\s+privileges\b/, reason: "changing default privileges is not allowed" },

  // Running code on the server
  { pattern: /\b(create|alter|drop)\s+(or\s+replace\s+)?(function|procedure|trigger|rule|policy|cast|language|operator|aggregate)\b/, reason: "defining server-side code is not allowed" },
  { pattern: /\bcreate\s+event\s+trigger\b/, reason: "event triggers are not allowed" },
  { pattern: /\bsecurity\s+definer\b/, reason: "SECURITY DEFINER is not allowed" },
  { pattern: /^do\b/, reason: "anonymous code blocks (DO) are not allowed" },
  { pattern: /\bcall\s+/, reason: "CALL is not allowed" },
  { pattern: /\b(prepare|execute|deallocate)\b/, reason: "prepared statements are not allowed here" },

  // Filesystem and network reach
  { pattern: /^copy\b/, reason: "COPY can read and write server files" },
  { pattern: /\bpg_read_file\b|\bpg_read_binary_file\b|\bpg_ls_dir\b|\bpg_stat_file\b/, reason: "reading server files is not allowed" },
  { pattern: /\blo_import\b|\blo_export\b|\blo_get\b|\blo_put\b|\blo_unlink\b/, reason: "large object file access is not allowed" },
  { pattern: /\bdblink\b|\bpostgres_fdw\b/, reason: "connecting to other databases is not allowed" },

  // Credentials and other people's data
  { pattern: /\bpg_authid\b|\bpg_shadow\b|\bpg_user_mappings\b/, reason: "that catalog holds credentials" },
  { pattern: /\bpublic\s*\./, reason: "the public schema holds the application's own tables" },

  // Server control and session state
  { pattern: /\bpg_sleep\w*\b/, reason: "pg_sleep would hold the connection open" },
  { pattern: /\bpg_terminate_backend\b|\bpg_cancel_backend\b|\bpg_reload_conf\b|\bpg_rotate_logfile\b|\bpg_promote\b|\bpg_switch_wal\b/, reason: "server control functions are not allowed" },
  { pattern: /^(set|reset)\b/, reason: "session settings are managed for you" },
  { pattern: /^(begin|commit|rollback|start\s+transaction|end|savepoint|release)\b/, reason: "each run is already wrapped in its own transaction" },
  { pattern: /^(listen|notify|unlisten)\b/, reason: "notifications are not allowed" },
  { pattern: /^(vacuum|cluster|reindex|checkpoint|discard)\b/, reason: "maintenance commands are not allowed" },
  // ANALYZE with no table would touch every table in the database.
  { pattern: /^analyze\s*$/, reason: "ANALYZE needs a table name here, e.g. ANALYZE orders" },
  { pattern: /^lock\b/, reason: "explicit LOCK could block other learners" },
  { pattern: /\bpg_terminate\b/, reason: "server control functions are not allowed" },
];

export type ValidationResult = {
  statements: SqlStatement[];
  /** Human-readable list of the statement kinds found, for the UI. */
  kinds: string[];
};

const MAX_STATEMENTS = 25;
const MAX_LENGTH = 20_000;

/**
 * Validate a batch of SQL. Throws SqlValidationError on the first problem so
 * the learner gets one clear message rather than a wall of complaints.
 */
export function validateSql(input: string, sessionSchema: string): ValidationResult {
  if (input.trim().length === 0) {
    throw new SqlValidationError("Nothing to run — the editor is empty.");
  }
  if (input.length > MAX_LENGTH) {
    throw new SqlValidationError(
      `That is a lot of SQL (${input.length} characters). The playground accepts up to ${MAX_LENGTH}.`,
    );
  }

  const statements = tokenizeSql(input);

  if (statements.length === 0) {
    throw new SqlValidationError("Nothing to run — only comments were found.");
  }
  if (statements.length > MAX_STATEMENTS) {
    throw new SqlValidationError(
      `Too many statements (${statements.length}). Run at most ${MAX_STATEMENTS} at a time.`,
    );
  }

  const kinds: string[] = [];

  for (const statement of statements) {
    const { normalized, raw } = statement;

    const allowed = ALLOWED_STATEMENT_PATTERNS.find((entry) =>
      entry.pattern.test(normalized),
    );
    if (!allowed) {
      const firstWords = normalized.split(" ").slice(0, 3).join(" ");
      throw new SqlValidationError(
        `"${firstWords}…" is not allowed in the playground. You can run SELECT, INSERT, UPDATE, DELETE, TRUNCATE, CREATE/ALTER/DROP TABLE, INDEX, VIEW and SEQUENCE, COMMENT ON and EXPLAIN.`,
        raw,
      );
    }

    for (const banned of BANNED_TOKENS) {
      if (banned.pattern.test(normalized)) {
        throw new SqlValidationError(`Blocked: ${banned.reason}.`, raw);
      }
    }

    // Reference to somebody else's playground schema.
    const schemaRefs = normalized.match(/\bplayground_[a-z0-9_]+/g) ?? [];
    for (const ref of schemaRefs) {
      if (ref !== sessionSchema) {
        throw new SqlValidationError(
          "That schema belongs to another session. Your tables are reachable by their plain names.",
          raw,
        );
      }
    }

    kinds.push(allowed.label);
  }

  return { statements, kinds };
}

/** True when the statement returns rows worth rendering as a table. */
export function returnsRows(normalized: string): boolean {
  return /^(select|with|values|table|explain)\b/.test(normalized) ||
    /\breturning\b/.test(normalized);
}
