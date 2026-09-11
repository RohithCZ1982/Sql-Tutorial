import Link from "next/link";
import { modules } from "@/lib/content/modules";

export const metadata = { title: "Modules — SQL Playground" };

export default function LearnIndex() {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">All modules</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Work through them in order — each one builds on the tables the previous module had
        you create.
      </p>

      <ol className="mt-6 flex flex-col gap-2">
        {modules.map((module, index) => (
          <li key={module.slug}>
            <Link
              href={`/learn/${module.slug}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-accent"
            >
              <span className="font-mono text-[11px] font-bold text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold">{module.title}</span>
              <span className="text-[13px] text-muted">{module.summary}</span>
              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted">
                {module.minutes} min
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
