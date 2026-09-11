import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "SQL Playground — learn SQL by running it",
  description:
    "An interactive course in SQL fundamentals: schemas, tables, constraints, indexes and CRUD, with a live Postgres playground and the Prisma equivalent of every example.",
};

/** Applied before paint so the page never flashes the wrong theme. */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("sqlplay-theme");
    var dark = stored ? stored === "dark"
                      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <SiteNav
          user={
            session
              ? {
                  email: session.user.email,
                  name: session.user.name,
                  role: session.user.role,
                }
              : null
          }
        />
        <main className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
