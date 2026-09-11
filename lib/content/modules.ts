import type { Module } from "./types";

/**
 * The course. Ten modules, each self-contained, each with something the
 * learner can run immediately in the playground.
 *
 * Every SQL example here is written to run inside a learner's playground
 * schema, so table names are unqualified and nothing references another schema.
 */
export const modules: Module[] = [
  /* ===================================================================== */
  {
    slug: "what-is-a-schema",
    title: "What is a database schema?",
    summary:
      "Server, database, schema, table — four words people use interchangeably, and what each one actually means.",
    minutes: 10,
    whatIsIt:
      "A schema is a named folder inside a database that holds tables, views, indexes and sequences. A database can contain many schemas, and each schema can contain many tables. When you write SELECT * FROM students, Postgres looks through a list of schemas called the search_path to find a table named students.",
    whyItMatters:
      "Almost every confusing 'relation does not exist' error comes from looking in the wrong schema. Schemas are also how one database safely holds several projects, several environments, or — as in this playground — one private workspace per learner.",
    syntax: `-- The full name of a table has three parts:
database . schema . table

-- In practice you write one or two:
SELECT * FROM students;             -- found via search_path
SELECT * FROM public.students;      -- explicit schema
SELECT * FROM myapp.students;       -- a different schema entirely`,
    example: `-- Which schema am I actually in right now?
SELECT current_database() AS database,
       current_schema()   AS schema,
       current_user       AS user;

-- What is on the search path? Postgres tries these in order.
SHOW search_path;

-- Every schema in this database
SELECT schema_name
FROM   information_schema.schemata
ORDER BY schema_name;`,
    prisma: `// Prisma works inside ONE schema by default — whichever the connection
// string points at. You can opt into several with the multiSchema feature:

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  schemas  = ["public", "analytics"]
}

model Student {
  id   Int    @id @default(autoincrement())
  name String

  @@schema("public")   // which schema this table lives in
}`,
    prismaNote:
      "A Prisma model maps to exactly one real table. The model name is how you talk to it in TypeScript; @@map lets the real table be named something else.",
    mistakes: [
      {
        wrong: "Assuming 'database' and 'schema' mean the same thing.",
        why: "In Postgres a database contains schemas. You cannot query across two databases in one statement, but you can query across two schemas freely.",
        fix: "Think: server → database → schema → table.",
      },
      {
        wrong: "relation \"students\" does not exist — even though you just created it.",
        why: "The table exists, but in a schema that is not on your search_path.",
        fix: "Qualify it (SELECT * FROM myschema.students) or add the schema to the search_path.",
      },
    ],
    tryIt: [
      {
        label: "Where am I?",
        sql: `SELECT current_database() AS database,
       current_schema()   AS schema,
       current_user       AS user;`,
        note: "Your schema name is unique to your session — that is why your tables never collide with anyone else's.",
      },
      {
        label: "List all schemas",
        sql: `SELECT schema_name
FROM   information_schema.schemata
ORDER BY schema_name;`,
        note: "You will see pg_catalog and information_schema alongside the playground schemas.",
      },
      {
        label: "Create a table and find it",
        sql: `CREATE TABLE students (
  id   INT,
  name TEXT
);

SELECT table_schema, table_name
FROM   information_schema.tables
WHERE  table_name = 'students';`,
        note: "Notice which schema it landed in — the one the playground put on your search_path.",
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "system-tables",
    title: "Default and system tables",
    summary:
      "information_schema and pg_catalog: the tables Postgres keeps about your tables, and how to read them.",
    minutes: 12,
    whatIsIt:
      "Postgres describes itself using ordinary tables. pg_catalog holds the internal truth — every table, column, index and constraint is a row in there. information_schema is a friendlier, SQL-standard view over the same information, so the same queries work on other databases too.",
    whyItMatters:
      "This is how tools work. Prisma introspection, GUI clients, migration tools and the schema visualizer in this app all read these catalogs. Once you can query them, you can answer 'what does this database actually contain?' without any tooling at all.",
    syntax: `-- The portable, standard way (works on MySQL, SQL Server too)
SELECT ... FROM information_schema.tables;
SELECT ... FROM information_schema.columns;
SELECT ... FROM information_schema.table_constraints;

-- The Postgres-specific way: more detail, more power
SELECT ... FROM pg_catalog.pg_class;    -- tables, indexes, sequences
SELECT ... FROM pg_catalog.pg_attribute; -- columns
SELECT ... FROM pg_catalog.pg_indexes;   -- readable index definitions`,
    example: `-- Every table you own, with its columns
SELECT c.table_name,
       c.column_name,
       c.data_type,
       c.is_nullable,
       c.column_default
FROM   information_schema.columns c
JOIN   information_schema.tables t
       ON  t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
WHERE  t.table_schema = current_schema()
  AND  t.table_type   = 'BASE TABLE'
ORDER BY c.table_name, c.ordinal_position;`,
    prisma: `# Prisma reads exactly these catalogs when you run:
npx prisma db pull

# ...which writes a schema.prisma matching the real database.
# The reverse direction — schema.prisma to database — is:
npx prisma migrate dev --name add_students`,
    prismaNote:
      "db pull is introspection (database is the source of truth). migrate is the opposite (your schema file is the source of truth). Pick one direction per project and stick to it.",
    mistakes: [
      {
        wrong: "Trying to UPDATE a catalog table to rename a column.",
        why: "The catalogs are mostly read-only, and editing them corrupts the database even when it appears to work.",
        fix: "Use ALTER TABLE. DDL is the supported way to change structure.",
      },
      {
        wrong: "Forgetting to filter by table_schema.",
        why: "You get every table in every schema, including hundreds of system ones, and the useful rows are buried.",
        fix: "Always add WHERE table_schema = current_schema().",
      },
    ],
    tryIt: [
      {
        label: "List my tables",
        sql: `SELECT table_name, table_type
FROM   information_schema.tables
WHERE  table_schema = current_schema()
ORDER BY table_name;`,
      },
      {
        label: "Columns and their types",
        sql: `SELECT table_name, column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = current_schema()
ORDER BY table_name, ordinal_position;`,
      },
      {
        label: "Constraints on my tables",
        sql: `SELECT tc.table_name, tc.constraint_name, tc.constraint_type
FROM   information_schema.table_constraints tc
WHERE  tc.table_schema = current_schema()
ORDER BY tc.table_name, tc.constraint_type;`,
        note: "Create a table with a PRIMARY KEY first, then run this to see it appear.",
      },
      {
        label: "How big is pg_catalog?",
        sql: `SELECT count(*) AS system_tables
FROM   information_schema.tables
WHERE  table_schema = 'pg_catalog';`,
        note: "That is the machinery Postgres uses to describe itself.",
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "create-table",
    title: "Creating tables and choosing column types",
    summary:
      "CREATE TABLE from first principles, and how to pick between INT, TEXT, VARCHAR, BOOLEAN, TIMESTAMP and friends.",
    minutes: 15,
    whatIsIt:
      "CREATE TABLE defines a new table: its name, its columns, and the type of each column. The type is a promise about what can go in the column, and Postgres enforces that promise on every insert and update.",
    whyItMatters:
      "Types are your first and cheapest line of defence against bad data. A date stored as TEXT will accept '31st of Febuary', sort incorrectly, and be painful to fix once a million rows exist.",
    syntax: `CREATE TABLE table_name (
  column_name  data_type  [constraints],
  column_name  data_type  [constraints],
  ...
);

CREATE TABLE IF NOT EXISTS table_name ( ... );  -- no error if it exists`,
    example: `CREATE TABLE students (
  id           SERIAL,
  full_name    TEXT         NOT NULL,
  email        VARCHAR(255),
  age          INT,
  is_active    BOOLEAN      DEFAULT true,
  gpa          NUMERIC(3,2),
  enrolled_at  TIMESTAMPTZ  DEFAULT now(),
  notes        TEXT
);

INSERT INTO students (full_name, email, age, gpa)
VALUES ('Ada Lovelace', 'ada@example.com', 28, 3.95);

SELECT * FROM students;`,
    prisma: `model Student {
  id         Int       @id @default(autoincrement())
  fullName   String    @map("full_name")
  email      String?   @db.VarChar(255)
  age        Int?
  isActive   Boolean   @default(true) @map("is_active")
  gpa        Decimal?  @db.Decimal(3, 2)
  enrolledAt DateTime  @default(now()) @map("enrolled_at") @db.Timestamptz()
  notes      String?

  @@map("students")
}`,
    prismaNote:
      "In Prisma a field is required by default; String? with a question mark is the nullable version. That is the opposite of SQL, where columns are nullable unless you write NOT NULL.",
    table: {
      caption: "Choosing a column type",
      headers: ["Type", "Use it for", "Watch out for"],
      rows: [
        ["INT / BIGINT", "Counts, quantities, foreign keys", "INT stops at ~2.1 billion; use BIGINT for ids that will grow"],
        ["TEXT", "Any string, any length", "In Postgres TEXT is not slower than VARCHAR — prefer it"],
        ["VARCHAR(n)", "Strings with a real business limit", "n is a constraint, not an optimisation"],
        ["BOOLEAN", "true / false / unknown", "It is three-valued: NULL is not false"],
        ["NUMERIC(p,s)", "Money, anything needing exact decimals", "Never use FLOAT for money — 0.1 + 0.2 is not 0.3"],
        ["TIMESTAMPTZ", "Any point in time", "Prefer it over TIMESTAMP; it keeps the time zone honest"],
        ["DATE", "A calendar day with no time", "Use when the time of day is genuinely meaningless"],
        ["UUID", "Distributed or externally-visible ids", "Random UUIDs fragment indexes; see the indexing module"],
        ["JSONB", "Genuinely unstructured data", "If you filter on a field constantly, promote it to a column"],
      ],
    },
    mistakes: [
      {
        wrong: "email VARCHAR(50)",
        why: "Real email addresses are routinely longer, and the error only appears in production with a real user.",
        fix: "Use TEXT unless a limit is a genuine business rule.",
      },
      {
        wrong: "price FLOAT",
        why: "Floating point cannot represent 0.1 exactly, so totals drift by fractions of a cent and never reconcile.",
        fix: "NUMERIC(10,2) for money, always.",
      },
      {
        wrong: "created_at TEXT",
        why: "Sorts alphabetically, cannot do date arithmetic, and accepts nonsense.",
        fix: "TIMESTAMPTZ DEFAULT now().",
      },
    ],
    tryIt: [
      {
        label: "Create the students table",
        sql: `CREATE TABLE students (
  id           SERIAL,
  full_name    TEXT         NOT NULL,
  email        VARCHAR(255),
  age          INT,
  is_active    BOOLEAN      DEFAULT true,
  gpa          NUMERIC(3,2),
  enrolled_at  TIMESTAMPTZ  DEFAULT now()
);

SELECT 'created' AS status;`,
      },
      {
        label: "Watch a type reject bad data",
        sql: `-- age is INT, so this is refused before it ever hits disk
INSERT INTO students (full_name, age)
VALUES ('Bad Row', 'twenty-eight');`,
        note: "Read the error: Postgres tells you exactly which type it could not build.",
      },
      {
        label: "See why FLOAT is wrong for money",
        sql: `SELECT 0.1::float + 0.2::float   AS float_math,
       0.1::numeric + 0.2::numeric AS numeric_math;`,
        note: "One of these is 0.30000000000000004. That is the bug that never reconciles.",
      },
      {
        label: "Inspect what you built",
        sql: `SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_name = 'students' AND table_schema = current_schema()
ORDER BY ordinal_position;`,
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "primary-keys",
    title: "PRIMARY KEY and NOT NULL",
    summary:
      "The two constraints you will use on almost every table, and what each one really guarantees.",
    minutes: 12,
    whatIsIt:
      "A PRIMARY KEY is the column (or set of columns) that uniquely identifies each row. It is UNIQUE and NOT NULL at the same time, and Postgres automatically builds an index for it. NOT NULL simply says a column must always hold a value.",
    whyItMatters:
      "Without a primary key you cannot reliably point at one row — not to update it, not to delete it, and not to reference it from another table. Most ORMs, Prisma included, refuse to work properly with a table that has no unique identifier.",
    syntax: `-- Inline, on the column
CREATE TABLE t (id INT PRIMARY KEY);

-- Named, at the table level (better: you control the constraint name)
CREATE TABLE t (
  id INT,
  CONSTRAINT t_pkey PRIMARY KEY (id)
);

-- Composite: the PAIR must be unique, not each column alone
CREATE TABLE enrollments (
  student_id INT,
  course_id  INT,
  PRIMARY KEY (student_id, course_id)
);`,
    example: `CREATE TABLE courses (
  id         SERIAL PRIMARY KEY,
  code       TEXT   NOT NULL,
  title      TEXT   NOT NULL,
  max_seats  INT    NOT NULL
);

INSERT INTO courses (code, title, max_seats)
VALUES ('CS101', 'Intro to Databases', 30);

-- Refused: title is NOT NULL
INSERT INTO courses (code, max_seats) VALUES ('CS102', 25);`,
    prisma: `model Course {
  id        Int    @id @default(autoincrement())  // PRIMARY KEY
  code      String                                 // NOT NULL (no "?")
  title     String
  maxSeats  Int    @map("max_seats")

  @@map("courses")
}

// Composite primary key:
model Enrollment {
  studentId Int
  courseId  Int

  @@id([studentId, courseId])
}`,
    prismaNote:
      "@id marks the primary key, @@id marks a composite one. A Prisma field with no ? is NOT NULL in the database.",
    mistakes: [
      {
        wrong: "Using a business value like email as the primary key.",
        why: "Business values change. When someone changes their email you have to update every row that references it.",
        fix: "Use a surrogate key (SERIAL/IDENTITY/UUID) as the primary key and put a UNIQUE constraint on email.",
      },
      {
        wrong: "Expecting NOT NULL to reject an empty string.",
        why: "'' is a value. NOT NULL only rejects the absence of a value.",
        fix: "Add a CHECK (length(trim(col)) > 0) as well.",
      },
      {
        wrong: "Assuming a composite PRIMARY KEY (a, b) makes a unique on its own.",
        why: "It makes the combination unique. The same a can appear many times with different b.",
        fix: "If a alone must be unique, add a separate UNIQUE constraint.",
      },
    ],
    tryIt: [
      {
        label: "Primary key blocks duplicates",
        sql: `CREATE TABLE courses (
  id    INT PRIMARY KEY,
  title TEXT NOT NULL
);

INSERT INTO courses (id, title) VALUES (1, 'Databases');
INSERT INTO courses (id, title) VALUES (1, 'Duplicate id');`,
        note: "The second insert fails, and the whole batch rolls back — read the constraint name in the error.",
      },
      {
        label: "NOT NULL blocks missing values",
        sql: `CREATE TABLE courses (
  id    INT PRIMARY KEY,
  title TEXT NOT NULL
);

INSERT INTO courses (id) VALUES (1);`,
      },
      {
        label: "NOT NULL still allows empty string",
        sql: `CREATE TABLE courses (
  id    INT PRIMARY KEY,
  title TEXT NOT NULL
);

INSERT INTO courses (id, title) VALUES (1, '');
SELECT id, title, length(title) AS title_length FROM courses;`,
        note: "Length 0, and the constraint was perfectly happy. This surprises everyone once.",
      },
      {
        label: "Composite key",
        sql: `CREATE TABLE enrollments (
  student_id INT,
  course_id  INT,
  PRIMARY KEY (student_id, course_id)
);

INSERT INTO enrollments VALUES (1, 100);
INSERT INTO enrollments VALUES (1, 200);  -- fine: different pair
INSERT INTO enrollments VALUES (1, 100);  -- refused: same pair`,
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "unique-default-check",
    title: "UNIQUE, DEFAULT and CHECK",
    summary:
      "Three constraints that encode business rules directly in the database, where nothing can bypass them.",
    minutes: 14,
    whatIsIt:
      "UNIQUE stops the same value appearing twice in a column. DEFAULT supplies a value when an insert does not mention the column. CHECK refuses any row that fails a condition you write yourself.",
    whyItMatters:
      "Application code can be bypassed — by a script, a migration, a second service, or a developer in a console. A constraint cannot. Rules that matter belong in the database as well as the app.",
    syntax: `-- UNIQUE
email TEXT UNIQUE,
CONSTRAINT users_email_key UNIQUE (email),
UNIQUE (tenant_id, email)          -- unique combination

-- DEFAULT
created_at TIMESTAMPTZ DEFAULT now(),
status     TEXT        DEFAULT 'pending',

-- CHECK
age   INT  CHECK (age >= 0),
price NUMERIC CHECK (price > 0),
CONSTRAINT valid_dates CHECK (ends_at > starts_at)`,
    example: `CREATE TABLE accounts (
  id         SERIAL PRIMARY KEY,
  email      TEXT        NOT NULL UNIQUE,
  plan       TEXT        NOT NULL DEFAULT 'free',
  seats      INT         NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT accounts_plan_valid  CHECK (plan IN ('free', 'pro', 'team')),
  CONSTRAINT accounts_seats_valid CHECK (seats BETWEEN 1 AND 100)
);

-- Defaults fill in plan, seats and created_at
INSERT INTO accounts (email) VALUES ('ada@example.com');

SELECT * FROM accounts;`,
    prisma: `model Account {
  id        Int      @id @default(autoincrement())
  email     String   @unique                       // UNIQUE
  plan      String   @default("free")              // DEFAULT
  seats     Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")

  @@map("accounts")
}

// Unique on a COMBINATION of columns:
model Membership {
  tenantId Int
  email    String

  @@unique([tenantId, email])
}`,
    prismaNote:
      "Prisma has no CHECK constraint in the schema language. Add it in a migration by hand — edit the generated SQL, or create an empty migration and write the ALTER TABLE ... ADD CONSTRAINT yourself.",
    mistakes: [
      {
        wrong: "Expecting UNIQUE to stop two NULLs.",
        why: "In SQL, NULL is 'unknown', and two unknowns are not considered equal, so a UNIQUE column accepts many NULL rows.",
        fix: "Add NOT NULL too, or use a partial unique index if some rows genuinely have no value.",
      },
      {
        wrong: "Relying only on application code to validate a status field.",
        why: "A background job, a data fix, or a second service will eventually write a value the app would have rejected.",
        fix: "Add CHECK (status IN (...)) so the database refuses it no matter who is asking.",
      },
      {
        wrong: "DEFAULT now() on a column that is also updated later.",
        why: "DEFAULT applies only at INSERT. It does not keep updated_at fresh.",
        fix: "Set updated_at explicitly in your UPDATE, or use a trigger (Prisma's @updatedAt does it in the client).",
      },
    ],
    tryIt: [
      {
        label: "UNIQUE rejects a duplicate",
        sql: `CREATE TABLE accounts (
  id    SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);

INSERT INTO accounts (email) VALUES ('ada@example.com');
INSERT INTO accounts (email) VALUES ('ada@example.com');`,
      },
      {
        label: "UNIQUE allows many NULLs",
        sql: `CREATE TABLE accounts (
  id    SERIAL PRIMARY KEY,
  email TEXT UNIQUE            -- nullable on purpose
);

INSERT INTO accounts (email) VALUES (NULL);
INSERT INTO accounts (email) VALUES (NULL);
INSERT INTO accounts (email) VALUES (NULL);

SELECT count(*) AS rows_inserted FROM accounts;`,
        note: "Three NULLs, no complaint. This is correct SQL and it catches people out constantly.",
      },
      {
        label: "DEFAULT fills the gaps",
        sql: `CREATE TABLE accounts (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO accounts (email) VALUES ('ada@example.com');
SELECT * FROM accounts;`,
      },
      {
        label: "CHECK enforces a business rule",
        sql: `CREATE TABLE accounts (
  id    SERIAL PRIMARY KEY,
  plan  TEXT NOT NULL,
  seats INT  NOT NULL,
  CONSTRAINT plan_valid  CHECK (plan IN ('free','pro','team')),
  CONSTRAINT seats_valid CHECK (seats BETWEEN 1 AND 100)
);

INSERT INTO accounts (plan, seats) VALUES ('pro', 5);      -- ok
INSERT INTO accounts (plan, seats) VALUES ('enterprise', 5); -- refused`,
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "foreign-keys",
    title: "FOREIGN KEY and referential actions",
    summary:
      "Linking tables together, and deciding what should happen when the row you point at disappears.",
    minutes: 16,
    whatIsIt:
      "A FOREIGN KEY says: the value in this column must already exist in that column of another table. It is how a relational database keeps relationships honest. ON DELETE and ON UPDATE tell Postgres what to do when the referenced row is deleted or its key changes.",
    whyItMatters:
      "Without foreign keys you get orphans — an order whose customer no longer exists, a comment on a deleted post. Those rows break reports, crash application code, and are extremely tedious to clean up later.",
    syntax: `-- Inline
customer_id INT REFERENCES customers(id)

-- Named, with behaviour spelled out
CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE

-- The options:
ON DELETE NO ACTION   -- default: refuse if children exist (checked at end of statement)
ON DELETE RESTRICT    -- refuse immediately
ON DELETE CASCADE     -- delete the children too
ON DELETE SET NULL    -- orphan the children, but keep them
ON DELETE SET DEFAULT -- point the children at the column default`,
    example: `CREATE TABLE customers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  total       NUMERIC(10,2) NOT NULL,

  CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE CASCADE
);

INSERT INTO customers (name) VALUES ('Ada');
INSERT INTO orders (customer_id, total) VALUES (1, 99.50);

-- Refused: customer 999 does not exist
INSERT INTO orders (customer_id, total) VALUES (999, 10.00);`,
    prisma: `model Customer {
  id     Int     @id @default(autoincrement())
  name   String
  orders Order[]                                  // the "many" side

  @@map("customers")
}

model Order {
  id         Int      @id @default(autoincrement())
  total      Decimal  @db.Decimal(10, 2)

  customerId Int      @map("customer_id")
  customer   Customer @relation(
    fields:     [customerId],
    references: [id],
    onDelete:   Cascade                           // ON DELETE CASCADE
  )

  @@map("orders")
}`,
    prismaNote:
      "Prisma's onDelete values map directly: Cascade, Restrict, SetNull, SetDefault, NoAction. The orders Order[] line creates no column — it is the relation field you use in TypeScript.",
    table: {
      caption: "What happens when you delete the parent row",
      headers: ["Action", "Effect on child rows", "Use it when"],
      rows: [
        ["NO ACTION (default)", "Delete is refused if children exist", "You want to be forced to think about it"],
        ["RESTRICT", "Same, checked immediately", "Same intent, no deferring"],
        ["CASCADE", "Children are deleted too", "Children are meaningless alone: order lines, post comments"],
        ["SET NULL", "Child keeps existing, FK becomes NULL", "The link is optional: an employee's manager leaves"],
        ["SET DEFAULT", "FK becomes the column's DEFAULT", "There is a sensible fallback row, e.g. 'unassigned'"],
      ],
    },
    mistakes: [
      {
        wrong: "Using ON DELETE CASCADE everywhere because it avoids errors.",
        why: "Deleting one customer can silently delete thousands of orders, and your finance data with it.",
        fix: "Cascade only when the child genuinely cannot exist alone. Otherwise let the error make you think.",
      },
      {
        wrong: "Not indexing the foreign key column.",
        why: "Postgres indexes the parent's primary key automatically, but not the child's FK column. Every cascade and every join scans the child table.",
        fix: "CREATE INDEX ON orders (customer_id);",
      },
      {
        wrong: "Mismatched types between the two columns.",
        why: "An INT column referencing a BIGINT primary key either errors outright or forces a cast on every check.",
        fix: "Make the FK column exactly the same type as the key it points at.",
      },
    ],
    tryIt: [
      {
        label: "Set up parent and child",
        sql: `CREATE TABLE customers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  total       NUMERIC(10,2) NOT NULL
);

INSERT INTO customers (name) VALUES ('Ada'), ('Grace');
INSERT INTO orders (customer_id, total) VALUES (1, 99.50), (1, 12.00), (2, 5.00);

SELECT * FROM orders;`,
      },
      {
        label: "A bad reference is refused",
        sql: `CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id)
);

INSERT INTO customers (name) VALUES ('Ada');
INSERT INTO orders (customer_id) VALUES (999);`,
        note: "This is the whole point of a foreign key: the orphan never gets created.",
      },
      {
        label: "RESTRICT blocks the delete",
        sql: `CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT
);

INSERT INTO customers (name) VALUES ('Ada');
INSERT INTO orders (customer_id) VALUES (1);

DELETE FROM customers WHERE id = 1;`,
      },
      {
        label: "CASCADE takes the children with it",
        sql: `CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE
);

INSERT INTO customers (name) VALUES ('Ada');
INSERT INTO orders (customer_id) VALUES (1), (1), (1);

DELETE FROM customers WHERE id = 1;

SELECT count(*) AS orders_left FROM orders;`,
        note: "Three orders vanished because one customer was deleted. Useful — and dangerous.",
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "auto-increment",
    title: "Auto-increment: SERIAL, IDENTITY and Prisma",
    summary:
      "Three ways to get an automatic id, why IDENTITY is the modern choice, and how sequences actually behave.",
    minutes: 13,
    whatIsIt:
      "Auto-increment means the database picks the next id for you. Postgres does this with a sequence: a small counter object that hands out numbers. SERIAL is the old shorthand that creates one for you; GENERATED ALWAYS AS IDENTITY is the SQL-standard replacement.",
    whyItMatters:
      "Almost every table needs a unique id, and letting the database allocate it is the only approach that stays correct when several connections insert at the same time. Picking ids in application code leads to collisions under load.",
    syntax: `-- Old shorthand (still everywhere)
id SERIAL PRIMARY KEY        -- int4
id BIGSERIAL PRIMARY KEY     -- int8

-- SQL standard, preferred for new tables
id INT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY
id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY

-- ALWAYS      -> you cannot supply your own value (use OVERRIDING to force it)
-- BY DEFAULT  -> you may supply one, which is handy for data imports`,
    example: `CREATE TABLE invoices (
  id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL
);

INSERT INTO invoices (amount) VALUES (10.00), (20.00);

SELECT * FROM invoices;

-- The counter is not rolled back by a failed insert, so gaps are normal:
INSERT INTO invoices (amount) VALUES (NULL);   -- fails
INSERT INTO invoices (amount) VALUES (30.00);  -- id jumps`,
    prisma: `model Invoice {
  id     Int     @id @default(autoincrement())
  amount Decimal @db.Decimal(10, 2)

  @@map("invoices")
}

// Prisma generates SERIAL by default. To get IDENTITY instead, edit the
// migration SQL:
//   id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY

// Other id strategies Prisma supports:
model Doc {
  id String @id @default(cuid())   // collision-resistant, sortable-ish
}
model Item {
  id String @id @default(uuid())   // random UUID v4
}`,
    prismaNote:
      "@default(autoincrement()) is the database allocating the number, not Prisma. cuid() and uuid() are generated in your application before the insert.",
    table: {
      caption: "SERIAL vs IDENTITY",
      headers: ["", "SERIAL", "GENERATED ... AS IDENTITY"],
      rows: [
        ["Standard SQL", "No, Postgres-specific", "Yes"],
        ["Owns its sequence", "Loosely — can be detached", "Yes, tied to the column"],
        ["Can you insert your own id?", "Yes, always", "Only with BY DEFAULT, or OVERRIDING SYSTEM VALUE"],
        ["Dropped with the column", "Sequence may survive", "Sequence always goes"],
        ["Recommended for new tables", "No", "Yes"],
      ],
    },
    mistakes: [
      {
        wrong: "Expecting ids to have no gaps.",
        why: "Sequences are not transactional. A rolled-back insert still consumed a number, on purpose — otherwise concurrent inserts would block each other.",
        fix: "Treat ids as identifiers, not as a count. Use COUNT(*) to count rows.",
      },
      {
        wrong: "Inserting explicit ids, then letting the sequence take over.",
        why: "The sequence still starts at 1 and will collide with the ids you inserted by hand.",
        fix: "Reset it: SELECT setval('invoices_id_seq', (SELECT max(id) FROM invoices));",
      },
      {
        wrong: "Using SERIAL on a table that will exceed 2.1 billion rows.",
        why: "SERIAL is int4. Running out is an outage, and changing the type later rewrites the whole table.",
        fix: "BIGSERIAL or BIGINT IDENTITY for anything high-volume.",
      },
    ],
    tryIt: [
      {
        label: "SERIAL in action",
        sql: `CREATE TABLE invoices (
  id     SERIAL PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL
);

INSERT INTO invoices (amount) VALUES (10.00), (20.00), (30.00);
SELECT * FROM invoices;`,
      },
      {
        label: "IDENTITY refuses a manual id",
        sql: `CREATE TABLE invoices (
  id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL
);

INSERT INTO invoices (id, amount) VALUES (1, 10.00);`,
        note: "That is the guarantee ALWAYS buys you: nobody can bypass the sequence by accident.",
      },
      {
        label: "Gaps are normal",
        sql: `CREATE TABLE invoices (
  id     SERIAL PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0)
);

INSERT INTO invoices (amount) VALUES (10.00);
SELECT * FROM invoices;`,
        note: "Run this, then run it again after editing the amount to -5 — the failed attempt still burns an id.",
      },
      {
        label: "Look at the sequence itself",
        sql: `CREATE TABLE invoices (id SERIAL PRIMARY KEY, amount NUMERIC(10,2));
INSERT INTO invoices (amount) VALUES (1), (2), (3);

SELECT last_value, is_called FROM invoices_id_seq;`,
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "indexes",
    title: "Indexes",
    summary:
      "What an index actually is, when it helps, when it hurts, and how to tell the difference with EXPLAIN.",
    minutes: 16,
    whatIsIt:
      "An index is a sorted copy of one or more columns, kept up to date automatically, that lets Postgres find rows without reading the whole table. It is the same idea as the index at the back of a book: a small ordered structure that points into a big unordered one.",
    whyItMatters:
      "Indexes are the difference between a query that takes 2 milliseconds and the same query taking 2 seconds. They are also not free: every index must be updated on every INSERT, UPDATE and DELETE, and it takes disk space.",
    syntax: `CREATE INDEX idx_orders_customer ON orders (customer_id);

CREATE UNIQUE INDEX idx_accounts_email ON accounts (email);

-- Composite: column ORDER matters
CREATE INDEX idx_orders_cust_date ON orders (customer_id, created_at);

-- Partial: index only the rows you actually query
CREATE INDEX idx_orders_open ON orders (created_at) WHERE status = 'open';

DROP INDEX idx_orders_customer;`,
    example: `CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20,000 rows so the planner has a real decision to make
INSERT INTO orders (customer_id, status)
SELECT (random() * 500)::int + 1,
       (ARRAY['open','shipped','closed'])[(random() * 2)::int + 1]
FROM generate_series(1, 20000);

ANALYZE orders;

-- Before: a sequential scan over everything
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

CREATE INDEX idx_orders_customer ON orders (customer_id);

-- After: an index scan
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;`,
    prisma: `model Order {
  id         Int      @id @default(autoincrement())
  customerId Int      @map("customer_id")
  status     String
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([customerId])                   // CREATE INDEX
  @@index([customerId, createdAt])        // composite
  @@unique([customerId, status])          // unique constraint + index

  @@map("orders")
}`,
    prismaNote:
      "@@index creates a plain index; @@unique creates a unique constraint (which is backed by a unique index). Prisma has no syntax for partial indexes — add those in a hand-edited migration.",
    mistakes: [
      {
        wrong: "Adding an index to every column just in case.",
        why: "Each one slows every write and consumes space, and the planner may still ignore it.",
        fix: "Index what you actually filter, join or sort on. Measure with EXPLAIN ANALYZE.",
      },
      {
        wrong: "Wrapping the indexed column in a function: WHERE lower(email) = '...'",
        why: "The index is on email, not on lower(email), so Postgres cannot use it.",
        fix: "Either query the raw column, or build the matching expression index: CREATE INDEX ON accounts (lower(email)).",
      },
      {
        wrong: "Getting composite column order backwards.",
        why: "An index on (a, b) helps queries filtering on a, or on a and b — but not b alone. It is sorted by a first.",
        fix: "Put the column you always filter on first.",
      },
      {
        wrong: "Expecting an index to help when the query returns most of the table.",
        why: "If you are reading 80% of the rows, jumping through an index is slower than a straight sequential scan. The planner knows this.",
        fix: "Nothing to fix — a sequential scan is the right plan there.",
      },
    ],
    tryIt: [
      {
        label: "Build a table worth indexing",
        sql: `CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  status      TEXT NOT NULL
);

INSERT INTO orders (customer_id, status)
SELECT (random() * 500)::int + 1,
       (ARRAY['open','shipped','closed'])[(random() * 2)::int + 1]
FROM generate_series(1, 20000);

ANALYZE orders;
SELECT count(*) FROM orders;`,
      },
      {
        label: "See the sequential scan",
        sql: `EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 42;`,
        note: "Look for 'Seq Scan' and the actual time. Run the setup example first.",
      },
      {
        label: "Add the index and compare",
        sql: `CREATE INDEX idx_orders_customer ON orders (customer_id);
ANALYZE orders;

EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 42;`,
        note: "'Bitmap Index Scan' or 'Index Scan' now, and a much smaller execution time.",
      },
      {
        label: "Watch a function defeat the index",
        sql: `CREATE INDEX idx_orders_status ON orders (status);
ANALYZE orders;

-- Uses the index
EXPLAIN SELECT * FROM orders WHERE status = 'open';

-- Cannot use it: the column is wrapped in a function
EXPLAIN SELECT * FROM orders WHERE upper(status) = 'OPEN';`,
      },
      {
        label: "List the indexes you have",
        sql: `SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = current_schema()
ORDER BY tablename, indexname;`,
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "crud",
    title: "INSERT, SELECT, UPDATE — the daily work",
    summary:
      "Getting data in, getting it back out with WHERE, ORDER BY and LIMIT, and changing it safely.",
    minutes: 18,
    whatIsIt:
      "These three statements are most of what anyone writes. INSERT adds rows, SELECT reads them, UPDATE changes existing ones. Everything else in SQL is refinement on top of these.",
    whyItMatters:
      "Reading data is the skill you use every day; writing it safely is the one that keeps you employed. An UPDATE without a WHERE clause changes every row in the table, and there is no undo once it is committed.",
    syntax: `INSERT INTO t (col, col) VALUES (v, v), (v, v)
  RETURNING *;                      -- get back what was actually stored

SELECT col, col
FROM   t
WHERE  condition
ORDER  BY col DESC
LIMIT  10 OFFSET 20;

UPDATE t
SET    col = value,
       col = value
WHERE  condition                    -- never omit this
RETURNING *;`,
    example: `CREATE TABLE students (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  score     INT  NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Multi-row insert, and get the generated ids back
INSERT INTO students (name, score) VALUES
  ('Ada',    92),
  ('Grace',  88),
  ('Alan',   75),
  ('Edsger', 61)
RETURNING id, name;

-- Filter, sort, limit
SELECT name, score
FROM   students
WHERE  score >= 75
ORDER  BY score DESC
LIMIT  2;

-- Update, and see exactly what changed
UPDATE students
SET    score = score + 5
WHERE  name = 'Alan'
RETURNING id, name, score;`,
    prisma: `// INSERT
await prisma.student.create({
  data: { name: "Ada", score: 92 },
});
await prisma.student.createMany({
  data: [{ name: "Grace", score: 88 }, { name: "Alan", score: 75 }],
});

// SELECT ... WHERE ... ORDER BY ... LIMIT
await prisma.student.findMany({
  where:   { score: { gte: 75 } },
  orderBy: { score: "desc" },
  take:    2,
  select:  { name: true, score: true },
});

// UPDATE
await prisma.student.update({
  where: { id: 3 },
  data:  { score: { increment: 5 } },
});`,
    prismaNote:
      "prisma.student.update() targets exactly one row by a unique field and throws if it is missing. updateMany() is the one that takes a filter and can hit many rows — it is the closer match to a plain SQL UPDATE.",
    mistakes: [
      {
        wrong: "UPDATE students SET score = 100;",
        why: "No WHERE clause, so every student now has 100. Committed, this is unrecoverable without a backup.",
        fix: "Write the WHERE first, run it as a SELECT to see what it matches, then convert it to an UPDATE.",
      },
      {
        wrong: "WHERE score = NULL",
        why: "NULL is never equal to anything, including itself, so this matches zero rows and reports no error.",
        fix: "WHERE score IS NULL.",
      },
      {
        wrong: "Using OFFSET for deep pagination.",
        why: "OFFSET 100000 makes Postgres generate and discard 100,000 rows before returning any.",
        fix: "Keyset pagination: WHERE id > :last_seen_id ORDER BY id LIMIT 20.",
      },
      {
        wrong: "SELECT * in application code.",
        why: "It breaks when a column is added, ships data you do not use, and prevents index-only scans.",
        fix: "Name the columns you need.",
      },
    ],
    tryIt: [
      {
        label: "Create and fill a table",
        sql: `CREATE TABLE students (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  score     INT  NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO students (name, score) VALUES
  ('Ada', 92), ('Grace', 88), ('Alan', 75), ('Edsger', 61), ('Barbara', 95)
RETURNING id, name, score;`,
      },
      {
        label: "Filter, sort, limit",
        sql: `SELECT name, score
FROM   students
WHERE  score >= 75
ORDER  BY score DESC
LIMIT  3;`,
      },
      {
        label: "Preview before you update",
        sql: `-- Step 1: SELECT with the exact WHERE you intend to use
SELECT id, name, score FROM students WHERE score < 70;

-- Step 2: only now turn it into an UPDATE
UPDATE students
SET    score = score + 10
WHERE  score < 70
RETURNING id, name, score;`,
        note: "This two-step habit is the single best protection against a catastrophic UPDATE.",
      },
      {
        label: "The NULL comparison trap",
        sql: `INSERT INTO students (name, score) VALUES ('Mystery', 0);
UPDATE students SET score = NULL WHERE name = 'Mystery';

SELECT count(*) AS matched_with_equals FROM students WHERE score = NULL;
SELECT count(*) AS matched_with_is_null FROM students WHERE score IS NULL;`,
        note: "First count is 0, second is 1. No error either way — that is what makes it dangerous.",
      },
    ],
  },

  /* ===================================================================== */
  {
    slug: "delete-vs-truncate",
    title: "DELETE vs TRUNCATE",
    summary:
      "Two ways to empty a table that behave completely differently — on speed, on rollback, on identity counters and on triggers.",
    minutes: 14,
    whatIsIt:
      "DELETE removes rows one at a time, checking constraints and firing triggers for each, and it can be given a WHERE clause. TRUNCATE throws away the entire contents of the table in one operation, without looking at individual rows.",
    whyItMatters:
      "TRUNCATE is dramatically faster for clearing a large table, but it is a blunt instrument: it cannot be filtered, it takes an exclusive lock, and it can reset your id counters. Choosing the wrong one either wastes hours or destroys data you meant to keep.",
    syntax: `-- DELETE: precise, row by row
DELETE FROM students WHERE score < 50;
DELETE FROM students;                 -- every row, still row by row

-- TRUNCATE: all or nothing
TRUNCATE TABLE students;
TRUNCATE TABLE students RESTART IDENTITY;          -- reset the sequence too
TRUNCATE TABLE students, courses CASCADE;          -- and anything referencing them`,
    example: `CREATE TABLE students (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  score INT  NOT NULL
);

INSERT INTO students (name, score)
SELECT 'Student ' || g, (random() * 100)::int
FROM generate_series(1, 1000) AS g;

-- Precise removal
DELETE FROM students WHERE score < 50;
SELECT count(*) AS survivors FROM students;

-- Wipe it, and reset ids back to 1
TRUNCATE TABLE students RESTART IDENTITY;

INSERT INTO students (name, score) VALUES ('Fresh Start', 100);
SELECT * FROM students;   -- id is 1 again`,
    prisma: `// DELETE with a filter
await prisma.student.deleteMany({
  where: { score: { lt: 50 } },
});

// DELETE everything (still row by row)
await prisma.student.deleteMany({});

// Prisma has no truncate() method. Drop to raw SQL:
await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "students" RESTART IDENTITY CASCADE'
);`,
    prismaNote:
      "deleteMany({}) is a DELETE, not a TRUNCATE — on a large table it is far slower and leaves the id sequence where it was. Use $executeRawUnsafe for a real truncate, and note the table name must be quoted exactly as it exists.",
    table: {
      caption: "DELETE vs TRUNCATE, side by side",
      headers: ["", "DELETE", "TRUNCATE"],
      rows: [
        ["Statement type", "DML", "DDL"],
        ["Can filter with WHERE", "Yes", "No — all rows, always"],
        ["Speed on a big table", "Slow: per-row work and WAL per row", "Fast: drops the underlying storage"],
        ["Rollback inside a transaction", "Yes", "Yes in Postgres (not in MySQL or Oracle)"],
        ["Fires row triggers", "Yes (BEFORE/AFTER DELETE)", "No — only TRUNCATE triggers"],
        ["Resets SERIAL / IDENTITY", "No", "Only with RESTART IDENTITY"],
        ["Reclaims disk space", "Not immediately — needs VACUUM", "Immediately"],
        ["Lock taken", "Row-level", "ACCESS EXCLUSIVE — blocks all readers too"],
        ["Foreign keys pointing in", "Blocked or cascaded per row", "Refused unless you add CASCADE"],
        ["Returns affected count", "Yes", "No"],
      ],
    },
    mistakes: [
      {
        wrong: "Running TRUNCATE expecting to filter it later.",
        why: "There is no WHERE clause. The moment it runs, every row is gone.",
        fix: "If you need a filter, you need DELETE.",
      },
      {
        wrong: "Assuming TRUNCATE cannot be rolled back.",
        why: "That is true in MySQL and Oracle, where it is auto-committed. In Postgres it is transactional.",
        fix: "In Postgres, BEGIN; TRUNCATE ...; ROLLBACK; genuinely restores the rows.",
      },
      {
        wrong: "Expecting DELETE FROM t to free disk space.",
        why: "Deleted rows are only marked dead. The file stays the same size until VACUUM reclaims it.",
        fix: "TRUNCATE if you want the space back immediately, or VACUUM FULL (which locks the table).",
      },
      {
        wrong: "Relying on DELETE triggers to audit a table you TRUNCATE.",
        why: "TRUNCATE does not fire row-level triggers, so your audit log silently misses the biggest event of all.",
        fix: "Add a TRUNCATE trigger, or forbid truncating audited tables.",
      },
    ],
    tryIt: [
      {
        label: "Set up 1,000 rows",
        sql: `CREATE TABLE students (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  score INT  NOT NULL
);

INSERT INTO students (name, score)
SELECT 'Student ' || g, (random() * 100)::int
FROM generate_series(1, 1000) AS g;

SELECT count(*) FROM students;`,
      },
      {
        label: "DELETE with a filter",
        sql: `DELETE FROM students WHERE score < 50;
SELECT count(*) AS survivors FROM students;`,
        note: "Note the row count the playground reports — DELETE tells you how many it touched.",
      },
      {
        label: "DELETE does not reset ids",
        sql: `DELETE FROM students;
INSERT INTO students (name, score) VALUES ('After delete', 50);
SELECT id, name FROM students;`,
        note: "The id carries on from where the sequence had got to — it is not back to 1.",
      },
      {
        label: "TRUNCATE ... RESTART IDENTITY does",
        sql: `TRUNCATE TABLE students RESTART IDENTITY;
INSERT INTO students (name, score) VALUES ('After truncate', 50);
SELECT id, name FROM students;`,
        note: "id is 1 again. Compare this directly against the previous example.",
      },
      {
        label: "TRUNCATE refuses while a foreign key points in",
        sql: `CREATE TABLE grades (
  id         SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id)
);

TRUNCATE TABLE students;`,
        note: "Postgres protects the child table. TRUNCATE students, grades; or ... CASCADE would work.",
      },
    ],
  },
];

export function getModule(slug: string): Module | undefined {
  return modules.find((module) => module.slug === slug);
}

export const moduleSlugs = modules.map((module) => module.slug);
