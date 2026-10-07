"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* The QUOTA mark: a ring crossed by a bar, the station roundel in monochrome. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3.6" />
      <rect x="1.5" y="13.6" width="29" height="4.8" rx=".6" fill="currentColor" />
    </svg>
  );
}

const links = [
  { href: "/demo", label: "Demo" },
  { href: "/docs", label: "Docs" },
  { href: "/operator", label: "Operator" },
  { href: "/service", label: "Service" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <Link href="/" className="brand" aria-label="QUOTA home"><Mark /><span>QUOTA</span></Link>
      <nav aria-label="Primary">
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link href="/operator" className="btn primary sm nav-cta">Stake an agent</Link>
    </header>
  );
}
