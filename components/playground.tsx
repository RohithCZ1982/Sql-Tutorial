"use client";

import { useCallback, useEffect, useState } from "react";
import { SqlEditor } from "./sql-editor";
import { ResultsTable } from "./results-table";
import type { QueryResult } from "@/lib/playground";
import type { TryItExample } from "@/lib/content/types";

type RunResponse =
  | { ok: true; results: QueryResult[]; totalMs: number; schema: string }
  | {
      ok: false;
      error: string;
      detail?: string;
      hint?: string;
      statement?: string;
      results?: QueryResult[];
      schema: string;
    };

export type ExampleGroup = {
  title: string;
  href?: string;
  examples: TryItExample[];
};

export function Playground({
  initialSql = "",
  examples = [],
  groups,
  compact = false,
}: {
  initialSql?: string;
  examples?: TryItExample[];
  /**
   * When provided, the playground renders as a split view: examples on the
   * left, editor on the right, results underneath spanning both.
   */
  groups?: ExampleGroup[];
  compact?: boolean;
}) {
  const [sql, setSql] = useState(initialSql);
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setNetworkError(null);
    try {
      const res = await fetch("/api/playground/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      setResponse((await res.json()) as RunResponse);
    } catch {
      setNetworkError("Could not reach the server. Check that the app is still running.");
    } finally {
      setRunning(false);
    }
  }, [sql, running]);

  async function reset() {
    setResetting(true);
    setNetworkError(null);
    try {
      await fetch("/api/playground/reset", { method: "POST" });
      setResponse(null);
      setNote("Playground reset — every table you made is gone.");
      setTimeout(() => setNote(null), 3000);
    } catch {
      setNetworkError("Could not reach the server.");
    } finally {
      setResetting(false);
    }
  }

  function loadExample(example: TryItExample) {
    setSql(example.sql);
    setResponse(null);
    setNote(example.note ?? null);
  }

  // Keep the editor in step when the page navigates to a different module.
  useEffect(() => {
    setSql(initialSql);
    setResponse(null);
  }, [initialSql]);

  const successResults = response?.ok ? response.results : (response?.results ?? []);

  const editorPane = (
    <div className="flex min-w-0 flex-col gap-3">
      <SqlEditor
        value={sql}
        onChange={setSql}
        onRun={run}
        minHeight={compact ? "180px" : "300px"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={running || sql.trim().length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run SQL"}
        </button>
        <span className="text-xs text-muted">or press Ctrl/Cmd + Enter</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-soft transition hover:border-bad hover:text-bad disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset playground"}
        </button>
      </div>
    </div>
  );

  const output = (
    <div className="flex flex-col gap-3">
      {note && (
        <p className="rounded-lg border border-line bg-accent-soft px-3 py-2 text-sm text-accent">
          {note}
        </p>
      )}

      {networkError && (
        <p className="rounded-lg border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">
          {networkError}
        </p>
      )}

      {response && !response.ok && (
        <div className="rounded-xl border border-bad bg-bad-soft p-3">
          <p className="text-sm font-semibold text-bad">Postgres rejected that</p>
          <p className="mt-1 font-mono text-[13px] text-bad">{response.error}</p>
          {response.detail && (
            <p className="mt-1.5 text-[13px] text-ink-soft">
              <span className="font-semibold">Detail:</span> {response.detail}
            </p>
          )}
          {response.hint && (
            <p className="mt-1 text-[13px] text-ink-soft">
              <span className="font-semibold">Hint:</span> {response.hint}
            </p>
          )}
          {response.statement && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-[12px] text-ink-soft">
              {response.statement}
            </pre>
          )}
          {successResults.length > 0 && (
            <p className="mt-2 text-[13px] text-ink-soft">
              {successResults.length} earlier statement
              {successResults.length === 1 ? "" : "s"} ran and committed before this one failed.
            </p>
          )}
        </div>
      )}

      {successResults.length > 0 && (
        <div className="flex flex-col gap-2">
          {successResults.map((result, index) => (
            <ResultsTable key={index} result={result} />
          ))}
        </div>
      )}

      {response?.ok && response.results.length > 0 && (
        <p className="text-xs text-muted">
          {response.results.length} statement{response.results.length === 1 ? "" : "s"} in{" "}
          {response.totalMs} ms
        </p>
      )}
    </div>
  );

  // ---- split layout: examples left, editor right, results underneath ----
  if (groups) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-xl border border-line bg-surface p-3 lg:max-h-[520px] lg:overflow-y-auto">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Examples by topic
            </h2>
            <div className="mt-2.5 flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="text-[13px] font-semibold">{group.title}</p>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {group.examples.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        onClick={() => loadExample(example)}
                        className="rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-soft transition hover:bg-accent-soft hover:text-accent"
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {editorPane}
        </div>

        {output}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Load an example:</span>
          {examples.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => loadExample(example)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent"
            >
              {example.label}
            </button>
          ))}
        </div>
      )}

      {editorPane}
      {output}
    </div>
  );
}
