import Link from "next/link";
import { notFound } from "next/navigation";
import { modules, getModule } from "@/lib/content/modules";
import { CodeBlock } from "@/components/code-block";
import { Playground } from "@/components/playground";
import { ProgressToggle } from "@/components/progress-toggle";
import { getSession, requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export function generateStaticParams() {
  return modules.map((module) => ({ slug: module.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const module = getModule(slug);
  return { title: module ? `${module.title} — SQL Playground` : "Not found" };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePageSession(`/learn/${slug}`);

  const module = getModule(slug);
  if (!module) notFound();

  const index = modules.findIndex((m) => m.slug === slug);
  const previous = index > 0 ? modules[index - 1] : null;
  const next = index < modules.length - 1 ? modules[index + 1] : null;

  const session = await getSession();
  const isComplete = session
    ? (await prisma.progress.findUnique({
        where: { userId_moduleSlug: { userId: session.user.id, moduleSlug: slug } },
        select: { id: true },
      })) !== null
    : false;

  return (
    <article className="py-8">
      <nav className="text-[13px] text-muted">
        <Link href="/learn" className="hover:text-accent">
          Modules
        </Link>
        <span className="px-1.5">/</span>
        <span>Module {index + 1}</span>
      </nav>

      <header className="mt-2 border-b border-line pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{module.title}</h1>
        <p className="mt-2 max-w-3xl text-ink-soft">{module.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            {module.minutes} min
          </span>
          {session && <ProgressToggle slug={module.slug} initialComplete={isComplete} />}
        </div>
      </header>

      {/* ---- Explanation ---- */}
      <section className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              What is it?
            </h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{module.whatIsIt}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Why does it matter?
            </h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{module.whyItMatters}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Syntax</h2>
            <div className="mt-2">
              <CodeBlock code={module.syntax} caption="SQL" copyLabel="Copy SQL" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Working example
            </h2>
            <div className="mt-2">
              <CodeBlock code={module.example} caption="SQL" copyLabel="Copy SQL" />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              The Prisma equivalent
            </h2>
            <div className="mt-2">
              <CodeBlock code={module.prisma} caption="Prisma" copyLabel="Copy Prisma" />
            </div>
            {module.prismaNote && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{module.prismaNote}</p>
            )}
          </div>
        </div>
      </section>

      {/* ---- Optional comparison table ---- */}
      {module.table && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
            {module.table.caption}
          </h2>
          <div
            className="mt-2 overflow-x-auto rounded-xl border border-line"
            style={{ overscrollBehaviorX: "contain" }}
          >
            <table className="w-full min-w-[520px] border-collapse bg-surface text-sm">
              <thead>
                <tr>
                  {module.table.headers.map((header) => (
                    <th
                      key={header}
                      className="border-b border-line bg-surface-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {module.table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-surface-2">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={[
                          "border-b border-line px-3 py-2 align-top",
                          cellIndex === 0 ? "font-semibold text-ink" : "text-ink-soft",
                        ].join(" ")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- Mistakes ---- */}
      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-warn">
          Common mistakes
        </h2>
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {module.mistakes.map((mistake) => (
            <li
              key={mistake.wrong}
              className="rounded-xl border border-line bg-warn-soft p-3.5"
            >
              <p className="font-mono text-[12.5px] font-semibold text-warn">{mistake.wrong}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{mistake.why}</p>
              {mistake.fix && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                  <span className="font-semibold">Fix: </span>
                  {mistake.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Try it ---- */}
      <section className="mt-9 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
        <h2 className="text-lg font-bold tracking-tight">Try it yourself</h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          This runs against a real Postgres database in your own private schema. Load an
          example or write your own.
        </p>
        <div className="mt-4">
          <Playground
            initialSql={module.tryIt[0]?.sql ?? ""}
            examples={module.tryIt}
            compact
          />
        </div>
      </section>

      {/* ---- Pager ---- */}
      <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {previous ? (
          <Link
            href={`/learn/${previous.slug}`}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink-soft transition hover:border-accent hover:text-accent"
          >
            ← {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/learn/${next.slug}`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            {next.title} →
          </Link>
        ) : (
          <Link
            href="/schema"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            See your schema →
          </Link>
        )}
      </nav>
    </article>
  );
}
