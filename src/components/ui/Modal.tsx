"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const SIZE: Record<string, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};

/**
 * Bottom sheet on phones, centered dialog from `sm` up. Header and footer stay
 * pinned while the body scrolls.
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  size = "md",
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: React.ElementType;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  headerExtra?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Let an open lightbox / confirm dialog handle Escape first.
      if (e.key === "Escape" && !document.querySelector(".z-\\[60\\], .z-\\[70\\]")) onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.985 }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className={cn(
              "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-3xl",
              SIZE[size],
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" />
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                {Icon && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
            {footer && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-3.5 sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Labeled form field. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

/** A titled group inside a long form. */
export function FormSection({
  step,
  title,
  description,
  children,
  aside,
}: {
  step?: string | number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-5 last:border-0 last:pb-0 [&+&]:pt-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {step !== undefined && (
            <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-surface-3 px-1 text-[10px] font-bold text-muted">
              {step}
            </span>
          )}
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
