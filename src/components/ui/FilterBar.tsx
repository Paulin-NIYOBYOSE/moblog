"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import Card from "./Card";

export default function FilterBar({
  children,
  expanded,
  expandedContent,
}: {
  children: ReactNode;
  expanded?: boolean;
  expandedContent?: ReactNode;
}) {
  return (
    <Card padding="sm" className="mb-4">
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      <AnimatePresence initial={false}>
        {expanded && expandedContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-border pt-3">{expandedContent}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
