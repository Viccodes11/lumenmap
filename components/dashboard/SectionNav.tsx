// SectionNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/overview", label: "Overview" },
  { href: "/treemap", label: "Treemap" },
  { href: "/flow", label: "Flow" },
  { href: "/flow/corridors", label: "Corridors" },
];

export function SectionNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-4 border-b border-white/10 pb-2">
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={`text-sm font-medium ${pathname === s.href ? "text-white" : "text-zinc-400 hover:text-white"}`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
