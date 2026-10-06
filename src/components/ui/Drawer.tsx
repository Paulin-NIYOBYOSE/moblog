"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/** Right-hand detail panel (full width on phones). */
export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerExtra,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Let an open lightbox / confirm handle Escape first.
      if (e.key === "Escape" && !document.querySelector(".z-\\[60\\], .z-\\[70\\]")) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 330 }}
            className={`relative z-10 flex h-full w-full ${width} flex-col border-l border-border bg-card shadow-2xl`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
                {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {headerExtra}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && <div className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-3.5 sm:px-6">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
