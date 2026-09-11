import Link from "next/link";
import { describeSchema } from "@/lib/playground";
import { readPlaygroundContext } from "@/lib/playground-session";

export const metadata = { title: "Your schema — SQL Playground" };
export const dynamic = "force-dynamic";

export default async function SchemaPage() {
  const context = await readPlaygroundContext();
  const tables = context ? await describeSchema(context.schema) : [];

  const relations = tables.flatMap((table) =>
    table.columns
      .filter((column) => column.foreignKey)
      .map((column) => ({
        from: table.name,
        fromColumn: column.name,
        to: column.foreignKey!.table,
        toColumn: column.foreignKey!.column,
        onDelete: column.foreignKey!.onDelete,
      })),
  );

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Your schema</h1>
          <p className="mt-1 text-ink-soft">
            Everything you have created in this session, read straight from the Postgres
            catalogs.
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted">{context?.schema ?? "not created yet"}</p>
      </div>

      {tables.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-semibold">No tables yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-soft">
            Create one in the playground and it will appear here, with its columns, keys,
            indexes and relationships.
          </p>
          <Link
            href="/playground"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Open the playground
          </Link>
        </div>
      ) : (
        <>
          {relations.length > 0 && (
            <section className="mt-6 rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
                Relationships
              </h2>
              <ul className="mt-2.5 flex flex-col gap-1.5 font-mono text-[13px]">
                {relations.map((relation, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{relation.from}</span>
                    <span className="text-muted">.{relation.fromColumn}</span>
                    <span className="text-accent">──▶</span>
                    <span className="font-semibold text-ink">{relation.to}</span>
                    <span className="text-muted">.{relation.toColumn}</span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                      ON DELETE {relation.onDelete}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {tables.map((table) => (
              <section key={table.name} className="rounded-xl border border-line bg-surface">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <h2 className="font-mono font-bold">{table.name}</h2>
                  <span className="text-[11px] uppercase tracking-wider text-muted">
                    {table.rowCount} row{table.rowCount === 1 ? "" : "s"}
                  </span>
                </header>

                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {table.columns.map((column) => (
                      <tr key={column.name} className="border-b border-line last:border-0">
                        <td className="px-4 py-1.5 font-mono font-medium">
                          {column.name}
                          {column.isPrimaryKey && (
                            <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                              PK
                            </span>
                          )}
                          {column.foreignKey && (
                            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                              FK
                            </span>
                          )}
                          {column.isUnique && !column.isPrimaryKey && (
                            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                              UQ
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-muted">{column.dataType}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-muted">
                          {!column.nullable && <span className="mr-1.5">NOT NULL</span>}
                          {column.default && (
                            <span className="font-mono">
                              = {column.default.length > 24
                                ? `${column.default.slice(0, 24)}…`
                                : column.default}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {table.indexes.length > 0 && (
                  <div className="border-t border-line px-4 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      Indexes
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {table.indexes.map((index) => (
                        <li key={index.name} className="font-mono text-[12px] text-ink-soft">
                          {index.name}
                          {index.isPrimary && (
                            <span className="ml-1.5 text-[10px] text-accent">primary</span>
                          )}
                          {index.isUnique && !index.isPrimary && (
                            <span className="ml-1.5 text-[10px] text-accent">unique</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
