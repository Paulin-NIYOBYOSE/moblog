"use client";

import { useEffect, useState } from "react";
import { Download, Share2, SlidersHorizontal, X } from "lucide-react";
import Card from "@/components/ui/Card";
import CustomSelect from "@/components/CustomSelect";
import MultiSelect from "@/components/ui/MultiSelect";
import { TIMEZONES, type TestingFilters } from "@/lib/testing/types";
import { WEEKDAYS, cn } from "@/lib/utils";

interface Options {
  sessions: { value: string; label: string }[];
  assets: string[];
  tags: string[];
  strategies: string[];
}

export default function TestingFilterBar({
  filters,
  onChange,
  options,
  onDownload,
  onShare,
}: {
  filters: TestingFilters;
  onChange: (filters: TestingFilters) => void;
  options: Options;
  onDownload: () => void;
  onShare: () => void;
}) {
  const [draft, setDraft] = useState<TestingFilters>(filters);

  useEffect(() => setDraft(filters), [filters]);

  function set<K extends keyof TestingFilters>(key: K, value: TestingFilters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);

  const pills = buildPills(filters, options);

  function removePill(id: string) {
    const next = applyPillRemoval(filters, id);
    setDraft(next);
    onChange(next);
  }

  function clearAll() {
    const next: TestingFilters = {
      status: "ALL",
      sessionIds: [],
      assets: [],
      sides: [],
      outcomes: [],
      tags: [],
      strategies: [],
      weekdays: [],
      timeFrom: "00:00",
      timeTo: "23:59",
      timezone: "Etc/UTC",
      dateFrom: "",
      dateTo: "",
      breakevenThreshold: filters.breakevenThreshold,
    };
    setDraft(next);
    onChange(next);
  }

  return (
    <Card padding="sm" className="mb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <CustomSelect
          value={draft.status}
          onChange={(v) => set("status", v as TestingFilters["status"])}
          className="w-32"
          options={[
            { value: "ALL", label: "Type: All" },
            { value: "OPEN", label: "Open only" },
            { value: "CLOSED", label: "Closed only" },
          ]}
        />
        <MultiSelect
          className="w-36"
          placeholder="Assets"
          value={draft.assets}
          onChange={(v) => set("assets", v)}
          options={options.assets.map((a) => ({ value: a, label: a }))}
        />
        <MultiSelect
          className="w-32"
          placeholder="Side"
          value={draft.sides}
          onChange={(v) => set("sides", v as TestingFilters["sides"])}
          options={[
            { value: "LONG", label: "Long" },
            { value: "SHORT", label: "Short" },
          ]}
        />
        <MultiSelect
          className="w-36"
          placeholder="Outcome"
          value={draft.outcomes}
          onChange={(v) => set("outcomes", v as TestingFilters["outcomes"])}
          options={[
            { value: "WIN", label: "Win" },
            { value: "LOSS", label: "Loss" },
            { value: "BREAKEVEN", label: "Breakeven" },
          ]}
        />
        <MultiSelect
          className="w-32"
          placeholder="Tags"
          value={draft.tags}
          onChange={(v) => set("tags", v)}
          options={options.tags.map((t) => ({ value: t, label: t }))}
        />
        <MultiSelect
          className="w-40"
          placeholder="Session"
          value={draft.sessionIds}
          onChange={(v) => set("sessionIds", v)}
          options={options.sessions}
        />
        <MultiSelect
          className="w-36"
          placeholder="Strategy"
          value={draft.strategies}
          onChange={(v) => set("strategies", v)}
          options={options.strategies.map((s) => ({ value: s, label: s }))}
        />
        <MultiSelect
          className="w-32"
          placeholder="Day"
          value={draft.weekdays.map(String)}
          onChange={(v) => set("weekdays", v.map(Number))}
          options={WEEKDAYS.map((label, i) => ({ value: String(i), label }))}
        />
        <div className="flex items-center gap-1">
          <input
            type="time"
            value={draft.timeFrom}
            onChange={(e) => set("timeFrom", e.target.value)}
            className="input w-24 text-xs"
          />
          <span className="text-muted">–</span>
          <input
            type="time"
            value={draft.timeTo}
            onChange={(e) => set("timeTo", e.target.value)}
            className="input w-24 text-xs"
          />
        </div>
        <CustomSelect
          value={draft.timezone}
          onChange={(v) => set("timezone", v)}
          className="w-40"
          options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
        />
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
            className="input w-[9.5rem] text-xs"
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            value={draft.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
            className="input w-[9.5rem] text-xs"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(draft)}
            disabled={!dirty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              dirty
                ? "bg-accent text-accent-foreground hover:opacity-95"
                : "bg-surface-2 text-muted",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Apply
          </button>
          <button
            type="button"
            onClick={onDownload}
            title="Download CSV"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onShare}
            title="Copy shareable link"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {pills.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted"
            >
              {p.label}
              <button
                type="button"
                onClick={() => removePill(p.id)}
                className="text-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs font-medium text-muted hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </Card>
  );
}

interface Pill {
  id: string;
  label: string;
}

function buildPills(filters: TestingFilters, options: Options): Pill[] {
  const pills: Pill[] = [];
  if (filters.status !== "ALL") pills.push({ id: "status", label: filters.status === "OPEN" ? "Open" : "Closed" });
  for (const a of filters.assets) pills.push({ id: `asset:${a}`, label: a });
  for (const s of filters.sides) pills.push({ id: `side:${s}`, label: s === "LONG" ? "Long" : "Short" });
  for (const o of filters.outcomes)
    pills.push({ id: `outcome:${o}`, label: o.charAt(0) + o.slice(1).toLowerCase() });
  for (const t of filters.tags) pills.push({ id: `tag:${t}`, label: `#${t}` });
  for (const id of filters.sessionIds) {
    const session = options.sessions.find((s) => s.value === id);
    if (session) pills.push({ id: `session:${id}`, label: session.label });
  }
  for (const s of filters.strategies) pills.push({ id: `strategy:${s}`, label: s });
  for (const w of filters.weekdays) pills.push({ id: `weekday:${w}`, label: WEEKDAYS[w] });
  if (filters.timeFrom !== "00:00" || filters.timeTo !== "23:59")
    pills.push({ id: "time", label: `${filters.timeFrom}–${filters.timeTo}` });
  if (filters.timezone !== "Etc/UTC") pills.push({ id: "timezone", label: filters.timezone });
  if (filters.dateFrom || filters.dateTo)
    pills.push({ id: "date", label: `${filters.dateFrom || "…"} → ${filters.dateTo || "…"}` });
  return pills;
}

function applyPillRemoval(filters: TestingFilters, id: string): TestingFilters {
  if (id === "status") return { ...filters, status: "ALL" };
  if (id === "time") return { ...filters, timeFrom: "00:00", timeTo: "23:59" };
  if (id === "timezone") return { ...filters, timezone: "Etc/UTC" };
  if (id === "date") return { ...filters, dateFrom: "", dateTo: "" };
  const [kind, value] = id.split(":");
  if (kind === "asset") return { ...filters, assets: filters.assets.filter((a) => a !== value) };
  if (kind === "side")
    return { ...filters, sides: filters.sides.filter((s) => s !== value) };
  if (kind === "outcome")
    return { ...filters, outcomes: filters.outcomes.filter((o) => o !== value) };
  if (kind === "tag") return { ...filters, tags: filters.tags.filter((t) => t !== value) };
  if (kind === "session")
    return { ...filters, sessionIds: filters.sessionIds.filter((s) => s !== value) };
  if (kind === "strategy")
    return { ...filters, strategies: filters.strategies.filter((s) => s !== value) };
  if (kind === "weekday")
    return { ...filters, weekdays: filters.weekdays.filter((w) => w !== Number(value)) };
  return filters;
}
