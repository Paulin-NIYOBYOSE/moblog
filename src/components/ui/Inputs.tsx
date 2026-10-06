"use client";

import { useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Multi-select chips with an optional "add your own" field. */
export function ChipGroup({
  options,
  value,
  onChange,
  allowCustom = false,
  customPlaceholder = "Add…",
  renderDot,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
  renderDot?: (option: string) => ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  function addCustom() {
    const v = draft.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((option) => {
        const active = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            data-active={active}
            onClick={() => toggle(option)}
            className="chip"
          >
            {renderDot?.(option)}
            {option}
            {active && <Check className="h-3 w-3 text-accent" />}
          </button>
        );
      })}
      {allowCustom && (
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong pl-2.5 pr-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={customPlaceholder}
            className="w-20 bg-transparent py-1 text-xs outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={addCustom}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Add"
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: React.ElementType;
  tone?: "profit" | "loss" | "accent" | "warning" | "muted";
}

const CHOICE_TONE: Record<NonNullable<Choice<string>["tone"]>, string> = {
  profit: "border-profit/50 bg-profit-soft text-profit",
  loss: "border-loss/50 bg-loss-soft text-loss",
  accent: "border-accent/50 bg-accent-soft text-accent",
  warning: "border-warning/50 bg-warning-soft text-warning",
  muted: "border-border-strong bg-surface-3 text-foreground",
};

/** Single-select tiles — the form equivalent of a segmented control. */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  columns,
  size = "md",
}: {
  options: Choice<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  columns?: number;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-all",
              size === "sm" ? "px-2 py-1.5" : "px-2 py-2.5",
              active
                ? CHOICE_TONE[o.tone ?? "accent"]
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground dark:bg-surface-2",
            )}
          >
            <span className="flex items-center gap-1.5 text-[0.8rem] font-semibold">
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </span>
            {o.hint && size === "md" && (
              <span className={cn("truncate text-[10px] font-medium", active ? "opacity-80" : "text-faint")}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Labeled on/off switch row. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        checked ? "border-accent/40 bg-accent-soft/60" : "border-border bg-surface hover:border-border-strong dark:bg-surface-2",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.82rem] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] text-muted">{description}</span>}
      </span>
      <span className="switch" data-on={checked} />
    </button>
  );
}

/** Tri-state yes / no / unanswered. */
export function YesNo({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="inline-flex rounded-[0.7rem] border border-border bg-surface-2 p-0.5">
      {[
        { v: true, label: yesLabel, cls: "bg-profit-soft text-profit" },
        { v: false, label: noLabel, cls: "bg-loss-soft text-loss" },
      ].map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(value === o.v ? null : o.v)}
          className={cn(
            "rounded-[0.55rem] px-3 py-1 text-xs font-semibold transition-colors",
            value === o.v ? o.cls : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–5 scale rendered as labeled steps. */
export function RatingScale({
  value,
  onChange,
  labels,
  icons,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  labels: string[];
  icons?: React.ElementType[];
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {labels.map((label, i) => {
        const level = i + 1;
        const active = value === level;
        const Icon = icons?.[i];
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(active ? null : level)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-all",
              active
                ? "border-accent/50 bg-accent-soft text-foreground"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground dark:bg-surface-2",
            )}
          >
            {Icon ? (
              <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={1.75} />
            ) : (
              <span className="text-sm font-bold tabular-nums">{level}</span>
            )}
            <span className="w-full truncate text-center text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Comma/enter-separated tag input. */
export function TagInput({
  value,
  onChange,
  placeholder = "Add tag and press Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setDraft("");
  }
  return (
    <div className="input flex min-h-[2.5rem] flex-wrap items-center gap-1.5 py-1.5">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-muted hover:text-foreground"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
      />
    </div>
  );
}
