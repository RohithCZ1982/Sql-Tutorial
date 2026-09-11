"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  accessDays: number | null;
  accessExpiresAt: string | null;
  statusNote: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { sessions: number; progress: number };
};

type AdminSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  playgroundSchema: string | null;
  user: { id: string; email: string; name: string | null; role: string };
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-warn bg-warn-soft text-warn",
  APPROVED: "border-ok bg-ok-soft text-ok",
  REJECTED: "border-bad bg-bad-soft text-bad",
  SUSPENDED: "border-bad bg-bad-soft text-bad",
};

export function AdminConsole({
  users,
  sessions,
  currentUserId,
}: {
  users: AdminUser[];
  sessions: AdminSession[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"users" | "sessions">("users");
  const [days, setDays] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function act(userId: string, body: Record<string, unknown>) {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That action failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const pending = users.filter((user) => user.status === "PENDING");

  return (
    <div className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Administration</h1>
          <p className="mt-1 text-ink-soft">
            Approve registrations, set how long access lasts, and see who is signed in.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {(
            [
              ["users", `Users (${users.length})`],
              ["sessions", `Signed in (${sessions.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                tab === key ? "bg-accent-soft text-accent" : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {pending.length > 0 && tab === "users" && (
        <p className="mt-4 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          {pending.length} account{pending.length === 1 ? "" : "s"} waiting for approval.
        </p>
      )}

      {tab === "users" ? (
        <div className="mt-5 flex flex-col gap-3">
          {users.map((user) => {
            const remaining = daysLeft(user.accessExpiresAt);
            const isSelf = user.id === currentUserId;
            const pendingAction = busy === user.id;

            return (
              <section
                key={user.id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{user.name ?? "(no name)"}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          STATUS_STYLES[user.status] ?? "border-line text-muted"
                        }`}
                      >
                        {user.status}
                      </span>
                      {user.role === "ADMIN" && (
                        <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                          Admin
                        </span>
                      )}
                      {isSelf && <span className="text-[11px] text-muted">(you)</span>}
                    </div>
                    <p className="mt-0.5 font-mono text-[13px] break-all text-ink-soft">
                      {user.email}
                    </p>
                    <p className="mt-1.5 text-[12px] text-muted">
                      Registered {formatDate(user.createdAt)} · Last sign-in{" "}
                      {formatDate(user.lastLoginAt)} · {user._count.sessions} session
                      {user._count.sessions === 1 ? "" : "s"} · {user._count.progress} module
                      {user._count.progress === 1 ? "" : "s"} done
                    </p>
                    {user.statusNote && (
                      <p className="mt-1.5 text-[13px] text-bad">Note: {user.statusNote}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Access
                    </p>
                    <p className="text-lg font-bold">
                      {user.status !== "APPROVED"
                        ? "—"
                        : user.accessExpiresAt === null
                          ? "Unlimited"
                          : remaining === 0
                            ? "Expired"
                            : `${remaining} day${remaining === 1 ? "" : "s"}`}
                    </p>
                    {user.accessExpiresAt && (
                      <p className="text-[11px] text-muted">
                        until {formatDate(user.accessExpiresAt)}
                      </p>
                    )}
                  </div>
                </div>

                {!isSelf && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                    <label className="flex items-center gap-1.5 text-[13px] text-muted">
                      Days
                      <input
                        type="number"
                        min={0}
                        max={3650}
                        value={days[user.id] ?? 30}
                        onChange={(event) =>
                          setDays({ ...days, [user.id]: Number(event.target.value) })
                        }
                        className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
                      />
                    </label>

                    {user.status === "PENDING" && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() =>
                          act(user.id, { action: "approve", accessDays: days[user.id] ?? 30 })
                        }
                        className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}

                    {user.status === "APPROVED" && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() =>
                          act(user.id, { action: "extend", accessDays: days[user.id] ?? 30 })
                        }
                        className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                      >
                        Extend
                      </button>
                    )}

                    {(user.status === "REJECTED" || user.status === "SUSPENDED") && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() => act(user.id, { action: "reinstate" })}
                        className="rounded-lg border border-ok px-3 py-1.5 text-[13px] font-semibold text-ok hover:bg-ok-soft disabled:opacity-50"
                      >
                        Reinstate
                      </button>
                    )}

                    {user.status === "PENDING" && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() => act(user.id, { action: "reject" })}
                        className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-soft hover:border-bad hover:text-bad disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}

                    {user.status === "APPROVED" && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() => act(user.id, { action: "suspend" })}
                        className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-soft hover:border-bad hover:text-bad disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}

                    {user._count.sessions > 0 && (
                      <button
                        type="button"
                        disabled={pendingAction}
                        onClick={() => act(user.id, { action: "revokeSessions" })}
                        className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-soft hover:border-bad hover:text-bad disabled:opacity-50"
                      >
                        Sign out everywhere
                      </button>
                    )}

                    <span className="text-[11px] text-muted">0 days = unlimited</span>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-line bg-surface">
          {sessions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Nobody is signed in.</p>
          ) : (
            <div className="overflow-x-auto" style={{ overscrollBehaviorX: "contain" }}>
              <table className="w-full min-w-[680px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {["User", "Signed in", "Last seen", "IP", "Browser", "Schema"].map(
                      (header) => (
                        <th
                          key={header}
                          className="border-b border-line bg-surface-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-2">
                      <td className="border-b border-line px-3 py-2">
                        <span className="font-medium">{row.user.name ?? row.user.email}</span>
                        <span className="block font-mono text-[11px] text-muted">
                          {row.user.email}
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        {formatDate(row.lastSeenAt)}
                      </td>
                      <td className="border-b border-line px-3 py-2 font-mono">
                        {row.ipAddress ?? "—"}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <span className="block max-w-[24ch] truncate" title={row.userAgent ?? ""}>
                          {row.userAgent ?? "—"}
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-2 font-mono text-[11px] text-muted">
                        {row.playgroundSchema ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
