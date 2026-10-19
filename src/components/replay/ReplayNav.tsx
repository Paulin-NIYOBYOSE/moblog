"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, History, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/replay", label: "Sessions", icon: History },
  { href: "/replay/datasets", label: "Datasets", icon: Database },
  { href: "/replay/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/replay/journal", label: "Journal", icon: NotebookPen },
];

export default function ReplayNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border no-scrollbar" aria-label="Replay sections">
      {TABS.map((t) => {
        const active = t.href === "/replay" ? pathname === "/replay" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            <t.icon className={cn("h-4 w-4", active ? "text-accent" : "text-faint")} />
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function ReplayFooter() {
  return (
    <footer className="mt-10 border-t border-border pt-4 text-xs text-faint">
      Replay stores candles, sessions and journals in this app&apos;s own PostgreSQL database — no paid services or API keys. Market data: FXCM&apos;s free archive (personal use) and files you import.
      Charts by{" "}
      <a className="underline hover:text-muted" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
        TradingView
      </a>{" "}
      Lightweight Charts™ (Apache-2.0). Market data comes only from files you import.
    </footer>
  );
}
