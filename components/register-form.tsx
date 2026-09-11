"use client";

import { useState } from "react";

export function RegisterForm() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not register that account.");
        return;
      }
      setDone(data.message);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-ok bg-ok-soft p-4">
        <p className="font-semibold text-ok">Registration received</p>
        <p className="mt-1.5 text-[13px] text-ink-soft">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {(
        [
          { key: "name", label: "Name", type: "text", autoComplete: "name" },
          { key: "email", label: "Email", type: "email", autoComplete: "email" },
          {
            key: "password",
            label: "Password (at least 10 characters)",
            type: "password",
            autoComplete: "new-password",
          },
        ] as const
      ).map((field) => (
        <label key={field.key} className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">{field.label}</span>
          <input
            type={field.type}
            required
            minLength={field.key === "password" ? 10 : undefined}
            autoComplete={field.autoComplete}
            value={form[field.key]}
            onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      ))}

      {error && (
        <p className="rounded-lg border border-bad bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Request an account"}
      </button>
    </form>
  );
}
