import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { RegisterForm } from "@/components/register-form";

export const metadata = { title: "Register — SQL Playground" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/account");

  return (
    <div className="mx-auto max-w-md py-14">
      <h1 className="text-2xl font-extrabold tracking-tight">Create an account</h1>
      <p className="mt-1.5 text-[14px] text-ink-soft">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-6 rounded-xl border border-line bg-surface p-3 text-[13px] text-muted">
        New accounts wait for an administrator to approve them and set how many days of
        access you get. You will not be able to sign in until that happens.
      </p>
    </div>
  );
}
