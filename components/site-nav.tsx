"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

type NavUser = { email: string; name: string | null; role: string } | null;

const links = [
  { href: "/", label: "Home", alwaysShow: false },
  { href: "/learn", label: "Modules", alwaysShow: true },
  { href: "/playground", label: "Playground", alwaysShow: true },
  { href: "/schema", label: "Schema", alwaysShow: false },
];

export function SiteNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur no-print">
      <nav className="mx-auto flex w-full max-w-7xl items-center gap-1.5 px-3 py-2.5 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 text-sm font-bold tracking-tight">
          SQL<span className="text-accent">
            {/* The full wordmark needs ~85px the narrow bar cannot spare. */}
            <span className="hidden sm:inline">Playground</span>
            <span className="sm:hidden">Play</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:gap-1">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "shrink-0 rounded-lg px-1.5 py-1.5 text-[13px] font-medium transition sm:px-3",
                  link.alwaysShow ? "" : "hidden sm:block",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {user ? (
            <>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:text-accent sm:block"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/account"
                className="hidden max-w-[12ch] truncate text-[13px] text-ink-soft hover:text-accent sm:block"
                title={user.email}
              >
                {user.name ?? user.email}
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-bad hover:text-bad"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-strong"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
