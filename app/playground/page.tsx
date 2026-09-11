import Link from "next/link";
import { Playground } from "@/components/playground";
import { readPlaygroundContext } from "@/lib/playground-session";
import { requirePageSession } from "@/lib/auth";
import { modules } from "@/lib/content/modules";

export const metadata = { title: "Playground — SQL Playground" };
export const dynamic = "force-dynamic";

const STARTER = `-- Your own private schema. Nothing here affects anyone else.
CREATE TABLE students (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT NOT NULL,
  score      INT  NOT NULL CHECK (score BETWEEN 0 AND 100)
);

INSERT INTO students (full_name, score)
VALUES ('Ada', 92), ('Grace', 88), ('Alan', 75)
RETURNING *;

SELECT * FROM students ORDER BY score DESC;
`;

export default async function PlaygroundPage() {
  await requirePageSession("/playground");
  const context = await readPlaygroundContext();

  const groups = modules.map((module) => ({
    title: module.title,
    href: `/learn/${module.slug}`,
    examples: module.tryIt,
  }));

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Playground</h1>
          <p className="mt-1 text-ink-soft">
            Write SQL, run it, read what Postgres says back. Every example from the course
            is one click away on the left.
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted">
          {context
            ? `schema: ${context.schema}`
            : "a private schema is created when you first run something"}
        </p>
      </div>

      <div className="mt-5">
        <Playground initialSql={STARTER} groups={groups} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <p className="rounded-xl border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Statements commit one at a time</span>,
          exactly like psql. If the third statement fails, the first two have already taken
          effect — which is why a failed example can still leave rows behind. Use Reset for a
          clean start.
        </p>
        <p className="rounded-xl border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Want the explanation too?</span> Each
          example belongs to a{" "}
          <Link href="/learn" className="font-medium text-accent hover:underline">
            module
          </Link>{" "}
          that walks through the idea, shows the Prisma equivalent, and lists the mistakes
          people usually make.
        </p>
      </div>
    </div>
  );
}
