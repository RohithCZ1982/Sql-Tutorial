import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, accessDaysRemaining, describeStatus } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { modules } from "@/lib/content/modules";

export const metadata = { title: "Your account — SQL Playground" };
export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value) + " UTC";
}

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, sessions, progress] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: {
        email: true,
        name: true,
        role: true,
        status: true,
        accessDays: true,
        accessExpiresAt: true,
        createdAt: true,
        lastLoginAt: true,
        approvedAt: true,
        approvedBy: { select: { email: true } },
      },
    }),
    prisma.session.findMany({
      where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.progress.findMany({
      where: { userId: session.user.id },
      select: { moduleSlug: true, completedAt: true },
    }),
  ]);

  const remaining = accessDaysRemaining(user.accessExpiresAt);
  const status = describeStatus(user.status, user.accessExpiresAt);
  const toneClass =
    status.tone === "ok"
      ? "border-ok bg-ok-soft text-ok"
      : status.tone === "warn"
        ? "border-warn bg-warn-soft text-warn"
        : "border-bad bg-bad-soft text-bad";

  return (
    <div className="py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">Your account</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4 lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Profile</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {[
              ["Name", user.name ?? "—"],
              ["Email", user.email],
              ["Role", user.role],
              ["Registered", formatDate(user.createdAt)],
              ["Last sign-in", formatDate(user.lastLoginAt)],
              ["Approved by", user.approvedBy?.email ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`rounded-xl border p-4 ${toneClass}`}>
          <h2 className="text-sm font-bold uppercase tracking-wider">Access</h2>
          <p className="mt-2 text-2xl font-extrabold">{status.label}</p>
          <dl className="mt-3 flex flex-col gap-1.5 text-[13px] text-ink-soft">
            <div className="flex justify-between gap-3">
              <dt>Granted</dt>
              <dd>{user.accessDays ? `${user.accessDays} days` : "Unlimited"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Expires</dt>
              <dd>{user.accessExpiresAt ? formatDate(user.accessExpiresAt) : "Never"}</dd>
            </div>
            {remaining !== null && (
              <div className="flex justify-between gap-3">
                <dt>Days left</dt>
                <dd>{remaining}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
          Progress · {progress.length} of {modules.length}
        </h2>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(progress.length / modules.length) * 100}%` }}
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {modules.map((module) => {
            const done = progress.some((row) => row.moduleSlug === module.slug);
            return (
              <li key={module.slug}>
                <Link
                  href={`/learn/${module.slug}`}
                  className={[
                    "inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    done
                      ? "border-ok bg-ok-soft text-ok"
                      : "border-line text-muted hover:border-accent hover:text-accent",
                  ].join(" ")}
                >
                  {done ? "✓ " : ""}
                  {module.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
          Your active sessions
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Every browser currently signed in as you.
        </p>
        <div className="mt-3 overflow-x-auto" style={{ overscrollBehaviorX: "contain" }}>
          <table className="w-full min-w-[540px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Signed in", "Last seen", "Expires", "IP", "Browser"].map((header) => (
                  <th
                    key={header}
                    className="border-b border-line px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={row.id} className={row.id === session.id ? "bg-accent-soft" : ""}>
                  <td className="border-b border-line px-2 py-1.5">{formatDate(row.createdAt)}</td>
                  <td className="border-b border-line px-2 py-1.5">{formatDate(row.lastSeenAt)}</td>
                  <td className="border-b border-line px-2 py-1.5">{formatDate(row.expiresAt)}</td>
                  <td className="border-b border-line px-2 py-1.5 font-mono">
                    {row.ipAddress ?? "—"}
                  </td>
                  <td className="border-b border-line px-2 py-1.5">
                    <span className="block max-w-[26ch] truncate" title={row.userAgent ?? ""}>
                      {row.userAgent ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
