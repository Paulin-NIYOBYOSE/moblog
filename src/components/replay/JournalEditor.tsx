"use client";

import { useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { Field } from "@/components/ui/Modal";
import { ChipGroup, RatingScale, TagInput } from "@/components/ui/Inputs";
import type { JournalEntry, StrategyTemplate } from "@/lib/replay/types";

export const EMOTIONS = ["Calm", "Confident", "Patient", "Anxious", "Impatient", "FOMO", "Revenge", "Bored", "Tired"];
export const MISTAKES = [
  "Entered early",
  "Entered late",
  "No confirmation",
  "Moved stop",
  "Closed too early",
  "Held too long",
  "Oversized",
  "Against trend",
  "Ignored plan",
  "News risk",
];

/**
 * Full journal form for one trade. Every field is optional; the quick note at
 * the top is all most trades need.
 */
export default function JournalEditor({
  value,
  onChange,
  strategies,
  defaultStrategy,
  onCaptureScreenshot,
}: {
  value: JournalEntry;
  onChange: (next: JournalEntry) => void;
  strategies: StrategyTemplate[];
  defaultStrategy?: string;
  onCaptureScreenshot?: () => string | null;
}) {
  const [shotError, setShotError] = useState<string | null>(null);
  const set = <K extends keyof JournalEntry>(k: K, v: JournalEntry[K]) => onChange({ ...value, [k]: v });
  const strategyName = value.strategy ?? defaultStrategy ?? "";
  const template = strategies.find((s) => s.name === strategyName);
  const setupOptions = template?.setups ?? [];

  return (
    <div className="space-y-4">
      <Field label="Quick note">
        <textarea
          className="input min-h-[64px] resize-y"
          placeholder="What happened, in a sentence…"
          value={value.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Strategy">
          <input
            className="input"
            list="replay-strategy-list"
            placeholder={defaultStrategy || "e.g. London breakout"}
            value={value.strategy ?? ""}
            onChange={(e) => set("strategy", e.target.value)}
          />
          <datalist id="replay-strategy-list">
            {strategies.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Setup">
          <input
            className="input"
            list="replay-setup-list"
            placeholder="e.g. Retest of range high"
            value={value.setup ?? ""}
            onChange={(e) => set("setup", e.target.value)}
          />
          <datalist id="replay-setup-list">
            {setupOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Tags">
        <TagInput value={value.tags ?? []} onChange={(tags) => set("tags", tags)} placeholder="Add a tag and press Enter" />
        {template && template.tags.some((t) => !(value.tags ?? []).includes(t)) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {template.tags
              .filter((t) => !(value.tags ?? []).includes(t))
              .map((t) => (
                <button key={t} type="button" className="chip !py-0.5 text-[11px]" onClick={() => set("tags", [...(value.tags ?? []), t])}>
                  + #{t}
                </button>
              ))}
          </div>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pre-trade plan">
          <textarea className="input min-h-[64px] resize-y" value={value.preTrade ?? ""} onChange={(e) => set("preTrade", e.target.value)} />
        </Field>
        <Field label="Post-trade review">
          <textarea className="input min-h-[64px] resize-y" value={value.postTrade ?? ""} onChange={(e) => set("postTrade", e.target.value)} />
        </Field>
        <Field label="Entry rationale">
          <textarea className="input min-h-[56px] resize-y" value={value.entryRationale ?? ""} onChange={(e) => set("entryRationale", e.target.value)} />
        </Field>
        <Field label="Exit rationale">
          <textarea className="input min-h-[56px] resize-y" value={value.exitRationale ?? ""} onChange={(e) => set("exitRationale", e.target.value)} />
        </Field>
      </div>
      <Field label="Market context">
        <input className="input" placeholder="Trend, key levels, news…" value={value.context ?? ""} onChange={(e) => set("context", e.target.value)} />
      </Field>
      <Field label="Confidence">
        <RatingScale labels={["Very low", "Low", "Medium", "High", "Very high"]} value={value.confidence ?? null} onChange={(v) => set("confidence", v ?? undefined)} />
      </Field>
      <Field label="Emotional state">
        <ChipGroup options={EMOTIONS} value={value.emotion ? [value.emotion] : []} onChange={(next) => set("emotion", next.find((x) => x !== value.emotion))} />
      </Field>
      <Field label="Mistakes">
        <ChipGroup options={MISTAKES} value={value.mistakes ?? []} onChange={(m) => set("mistakes", m)} allowCustom customPlaceholder="Other…" />
      </Field>
      <Field label="Lessons learned">
        <textarea className="input min-h-[56px] resize-y" value={value.lessons ?? ""} onChange={(e) => set("lessons", e.target.value)} />
      </Field>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Screenshot</span>
        {value.screenshot ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.screenshot} alt="Chart screenshot for this trade" className="w-full rounded-xl border border-border" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("screenshot", undefined)}>
              <ImageOff className="h-3.5 w-3.5" /> Remove screenshot
            </button>
          </div>
        ) : onCaptureScreenshot ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const shot = onCaptureScreenshot();
              if (shot) {
                setShotError(null);
                set("screenshot", shot);
              } else setShotError("Couldn't capture the chart.");
            }}
          >
            <Camera className="h-3.5 w-3.5" /> Attach current chart
          </button>
        ) : (
          <p className="text-xs text-faint">Open the session workstation to attach a chart screenshot.</p>
        )}
        {shotError && <p className="mt-1 text-xs text-loss">{shotError}</p>}
      </div>
    </div>
  );
}
