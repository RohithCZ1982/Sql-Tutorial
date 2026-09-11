import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in — SQL Playground" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSession()) redirect("/account");
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-14">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-[14px] text-ink-soft">
        No account?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Register
        </Link>{" "}
        — an administrator approves new accounts.
      </p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 rounded-xl border border-line bg-surface p-3 text-[13px] text-muted">
        The course modules and the playground are for signed-in learners. Registration
        needs an administrator to approve it and set how many days of access you get.
      </p>
    </div>
  );
}
