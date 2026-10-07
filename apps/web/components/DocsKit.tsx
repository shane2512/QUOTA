"use client";
import { useEffect, useState } from "react";

/* Sidebar that marks the section currently being read. */
export function DocsNav({ items }: { items: [id: string, label: string][] }) {
  const [on, setOn] = useState(items[0]?.[0]);
  useEffect(() => {
    const els = items.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setOn(seen[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" }, // the section crossing the upper third of the screen is "current"
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <aside aria-label="On this page">
      {items.map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={on === id ? "location" : undefined}>{label}</a>
      ))}
    </aside>
  );
}

/* Code block with a copy button. */
export function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return (
    <div className="code-wrap">
      <pre className="code"><code>{children}</code></pre>
      <button type="button" className="code-copy" onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
