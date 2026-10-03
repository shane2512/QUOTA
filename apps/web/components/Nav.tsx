"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Roundel({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="#1b4fd8" strokeWidth="5" />
      <rect x="1" y="13" width="30" height="6" fill="#0d1217" />
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
      <div className="wrap">
        <Link href="/" className="brand" aria-label="QUOTA home">
          <Roundel /> QUOTA
        </Link>
        <nav aria-label="Primary">
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
