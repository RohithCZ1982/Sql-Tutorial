import type { QueryResult } from "@/lib/playground";

function renderCell(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ResultsTable({ result }: { result: QueryResult }) {
  const hasRows = result.columns.length > 0;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
          {result.kind}
        </span>
        <span className="text-xs text-muted">
          {hasRows
            ? `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`
            : `${result.rowCount} row${result.rowCount === 1 ? "" : "s"} affected`}
        </span>
        <span className="text-xs text-muted">· {result.durationMs} ms</span>
        {result.truncated && (
          <span className="rounded-md bg-warn-soft px-2 py-0.5 text-[11px] text-warn">
            showing first 500
          </span>
        )}
      </div>

      {hasRows ? (
        result.rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            No rows matched. The query was valid — it just found nothing.
          </p>
        ) : (
          <div className="overflow-x-auto" style={{ overscrollBehaviorX: "contain" }}>
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th
                      key={column}
                      className="border-b border-line bg-surface-2 px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-surface-2">
                    {result.columns.map((column) => {
                      const value = row[column];
                      return (
                        <td
                          key={column}
                          className={[
                            "border-b border-line px-3 py-1.5 font-mono text-[12.5px] whitespace-pre",
                            value === null ? "text-muted italic" : "text-ink",
                          ].join(" ")}
                        >
                          {renderCell(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <p className="px-3 py-3 text-sm text-ink-soft">
          {result.command || "Done"} — no rows returned.
        </p>
      )}
    </div>
  );
}
