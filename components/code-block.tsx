import { CopyButton } from "./copy-button";

/**
 * A read-only code sample with a caption and a copy button.
 * Deliberately not syntax-highlighted: highlighting server-rendered SQL would
 * mean shipping a highlighter to the client for text nobody edits.
 */
export function CodeBlock({
  code,
  caption,
  copyLabel,
}: {
  code: string;
  caption?: string;
  copyLabel?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line">
      {caption && (
        <div
          className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-1"
          style={{ background: "var(--code-bg)" }}
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-accent">
            {caption}
          </span>
          <CopyButton text={code} label={copyLabel} />
        </div>
      )}
      <pre
        className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed"
        style={{ background: "var(--code-bg)", color: "var(--code-ink)", overscrollBehaviorX: "contain" }}
      >
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
