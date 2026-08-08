"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

export default function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "All",
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="input flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="truncate">{placeholder}</span>
          {value.length > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
              {value.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {options.length > 1 && (
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => onChange(options.map((o) => o.value))}
                className="font-medium text-accent hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-muted hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          <ul className="max-h-60 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">No options</li>
            )}
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
