import Link from "next/link";
import { modules } from "@/lib/content/modules";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function HomePage() {
  const session = await getSession();
  const completed = session
    ? (
        await prisma.progress.findMany({
          where: { userId: session.user.id },
          select: { moduleSlug: true },
        })
      ).map((row) => row.moduleSlug)
    : [];

  const totalMinutes = modules.reduce((sum, module) => sum + module.minutes, 0);

  return (
    <div className="py-10 sm:py-14">
      <section className="max-w-3xl">
        <span className="inline-block rounded-full border border-line bg-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent">
          Learn by running it
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
          SQL fundamentals, with a real database attached
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Ten short modules covering schemas, tables, constraints, indexes and CRUD. Every
          idea comes with SQL you can run immediately against live Postgres, the Prisma
          equivalent beside it, and the mistakes people actually make.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {session ? (
            <>
              <Link
                href={`/learn/${modules[0].slug}`}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                Start with module 1
              </Link>
              <Link
                href="/playground"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-accent hover:text-accent"
              >
                Open the playground
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                Sign in to start
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-accent hover:text-accent"
              >
                Request an account
              </Link>
            </>
          )}
        </div>

        <p className="mt-4 text-sm text-muted">
          {modules.length} modules · about {Math.round(totalMinutes / 60)} hours
          {!session && " · an administrator approves new accounts"}
        </p>
      </section>

      <section className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight">The course</h2>
          {session && (
            <p className="text-sm text-muted">
              {completed.length} of {modules.length} complete
            </p>
          )}
        </div>

        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module, index) => {
            const done = completed.includes(module.slug);
            return (
              <li key={module.slug}>
                <Link
                  href={
                    session
                      ? `/learn/${module.slug}`
                      : `/login?next=${encodeURIComponent(`/learn/${module.slug}`)}`
                  }
                  className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                      Module {index + 1}
                    </span>
                    {done && (
                      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[10px] font-semibold text-ok">
                        Done
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 font-semibold leading-snug group-hover:text-accent">
                    {module.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">
                    {module.summary}
                  </p>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">
                    {module.minutes} min
                  </p>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Your own private schema",
            body: "Every signed-in session gets a separate Postgres schema. Create, break and drop whatever you like — nobody else sees it, and Reset gives you a clean slate.",
          },
          {
            title: "SQL and Prisma together",
            body: "Each concept is shown as raw SQL and as the Prisma model or client call that produces it, so the mapping between the two stops being mysterious.",
          },
          {
            title: "Real errors, on purpose",
            body: "Several examples are designed to fail. Reading the constraint violation Postgres returns is the fastest way to understand what the constraint does.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-line bg-surface p-4">
            <h3 className="font-semibold">{card.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
