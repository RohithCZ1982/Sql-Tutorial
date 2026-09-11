import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in — SQL Playground" };

export default async function LoginPage() {
  if (await getSession()) redirect("/account");

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
        <LoginForm />
      </div>
      <p className="mt-6 rounded-xl border border-line bg-surface p-3 text-[13px] text-muted">
        You do not need an account to use the playground or read the modules. Signing in
        adds progress tracking and keeps your tables between visits.
      </p>
    </div>
  );
}
