"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ProgressToggle({
  slug,
  initialComplete,
}: {
  slug: string;
  initialComplete: boolean;
}) {
  const [complete, setComplete] = useState(initialComplete);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    const next = !complete;
    setComplete(next);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleSlug: slug, completed: next }),
    }).catch(() => setComplete(!next));
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={[
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition",
        complete
          ? "border-ok bg-ok-soft text-ok"
          : "border-line text-muted hover:border-accent hover:text-accent",
      ].join(" ")}
    >
      {complete ? "✓ Completed" : "Mark complete"}
    </button>
  );
}
