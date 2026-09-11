"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked (insecure context or denied permission).
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/40 hover:text-white"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
