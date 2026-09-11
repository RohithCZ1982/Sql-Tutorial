"use client";

import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { useEffect, useState } from "react";

export function SqlEditor({
  value,
  onChange,
  onRun,
  minHeight = "220px",
}: {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  minHeight?: string;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains("dark"));
    update();
    // The theme toggle mutates the class on <html>; mirror it here.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-surface"
      onKeyDown={(event) => {
        // Ctrl/Cmd + Enter runs, the way every SQL client behaves.
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onRun?.();
        }
      }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={dark ? "dark" : "light"}
        extensions={[sql({ dialect: PostgreSQL, upperCaseKeywords: true })]}
        minHeight={minHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          autocompletion: true,
          highlightActiveLine: false,
        }}
      />
    </div>
  );
}
