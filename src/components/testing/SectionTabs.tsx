"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Sessions", href: "/testing/sessions" },
  { label: "Analytics", href: "/testing/analytics" },
];

export default function SectionTabs() {
  const pathname = usePathname();
  const layoutId = useId();

  return (
    <div className="mb-5 flex items-center gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
