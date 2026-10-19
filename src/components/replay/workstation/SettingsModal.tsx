"use client";

import { useState } from "react";
import { AlertTriangle, Settings2 } from "lucide-react";
import Modal, { Field, FormSection } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Inputs";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { conversionPair, needsConversionRate } from "@/lib/replay/instruments";
import { DISPLAY_TIMEZONES, formatInTz, SOURCE_TIMEZONES } from "@/lib/replay/time";
import type { SessionSettings, StrategyTemplate } from "@/lib/replay/types";
import { CURRENCIES } from "@/lib/utils";

const EXECUTION_KEYS: (keyof SessionSettings)[] = [
  "initialBalance",
  "accountCurrency",
  "spreadMode",
  "spreadPips",
  "slippagePips",
  "commissionPerLot",
  "conversionRate",
  "dayBoundary",
];

export function ConversionField({
  settings,
  symbol,
  base,
  quote,
  onChange,
}: {
  settings: SessionSettings;
  symbol: string;
  base: string;
  quote: string;
  onChange: (rate: number | null) => void;
}) {
  if (!needsConversionRate({ base, quote }, settings.accountCurrency)) return null;
  const { pair, invert } = conversionPair({ quote }, settings.accountCurrency);
  const shown = settings.conversionRate ? (invert ? 1 / settings.conversionRate : settings.conversionRate) : "";
  return (
    <Field
      label={`${pair} rate (converts ${quote} P&L to ${settings.accountCurrency})`}
      hint={`Required: ${symbol} is quoted in ${quote}. A single fixed rate is used for every trade, so money values are approximate and marked as such. Import ${pair} data and use its typical level for the period.`}
    >
      <input
        className="input tabular-nums"
        type="number"
        min={0}
        step="any"
        value={shown === "" ? "" : +Number(shown).toFixed(6)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!e.target.value) onChange(null);
          else if (v > 0) onChange(invert ? 1 / v : v);
        }}
        placeholder={`e.g. ${invert ? "150.00" : "1.27"}`}
        data-testid="conversion-rate"
      />
    </Field>
  );
}

export default function SettingsModal({
  open,
  onClose,
  snap,
  strategies,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  snap: ControllerSnapshot;
  strategies: StrategyTemplate[];
  onSave: (args: { name: string; strategy: string; displayTimezone: string; settings: SessionSettings; executionChanged: boolean }) => void;
}) {
  const { session, dataset, spec } = snap;
  const [draft, setDraft] = useState<SessionSettings>(session.settings);
  const [name, setName] = useState(session.name);
  const [strategy, setStrategy] = useState(session.strategy);
  const [tz, setTz] = useState(session.displayTimezone);
  const set = <K extends keyof SessionSettings>(k: K, v: SessionSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const executionChanged = EXECUTION_KEYS.some((k) => draft[k] !== session.settings[k]);
  const hasActions = session.commands.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Session settings"
      subtitle={`${dataset.name} · ${dataset.symbol} ${dataset.timeframe}`}
      icon={Settings2}
      size="lg"
      footer={
        <>
          {executionChanged && hasActions && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> Saving recomputes all {session.commands.length} recorded actions.
            </span>
          )}
          <button type="button" className="btn btn-secondary ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave({ name, strategy, displayTimezone: tz, settings: draft, executionChanged })} data-testid="settings-save">
            Save settings
          </button>
        </>
      }
    >
      <div className="space-y-0">
        <FormSection step={1} title="Session">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Strategy">
              <input className="input" list="settings-strategies" value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy under test" />
              <datalist id="settings-strategies">
                {strategies.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Display time zone">
              <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
                {DISPLAY_TIMEZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Toggle checked={draft.pauseOnFill} onChange={(v) => set("pauseOnFill", v)} label="Pause playback on fills" description="Stops auto-play when an order fills or a position closes." />
            </div>
          </div>
        </FormSection>

        <FormSection step={2} title="Execution & costs" description="These change the trade ledger. To compare settings without losing results, duplicate the session first.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Starting balance">
              <input className="input tabular-nums" type="number" min={1} value={draft.initialBalance} onChange={(e) => set("initialBalance", Math.max(1, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Account currency">
              <select className="input" value={draft.accountCurrency} onChange={(e) => set("accountCurrency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Spread source" hint={dataset.hasSpread ? "This dataset has recorded per-minute spreads." : "No recorded spread in this dataset."}>
              <select className="input" value={draft.spreadMode} onChange={(e) => set("spreadMode", e.target.value as SessionSettings["spreadMode"])}>
                <option value="fixed">Fixed spread</option>
                <option value="recorded" disabled={!dataset.hasSpread}>
                  Recorded (from ticks)
                </option>
              </select>
            </Field>
            <Field label="Spread (pips)" hint={draft.spreadMode === "recorded" ? "Fallback where no spread was recorded." : undefined}>
              <input className="input tabular-nums" type="number" min={0} step={0.1} value={draft.spreadPips} onChange={(e) => set("spreadPips", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Slippage (pips)" hint="Adverse; market & stop fills only.">
              <input className="input tabular-nums" type="number" min={0} step={0.1} value={draft.slippagePips} onChange={(e) => set("slippagePips", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label={`Commission (${draft.accountCurrency}/lot, round turn)`}>
              <input className="input tabular-nums" type="number" min={0} step={0.5} value={draft.commissionPerLot} onChange={(e) => set("commissionPerLot", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Trading day boundary" hint="Where H4/D1/W1 candles and daily P&L roll over.">
              <select className="input" value={draft.dayBoundary} onChange={(e) => set("dayBoundary", e.target.value as SessionSettings["dayBoundary"])}>
                <option value="ny-close">17:00 New York (forex standard)</option>
                <option value="utc">00:00 UTC</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <ConversionField settings={draft} symbol={spec.symbol} base={spec.base} quote={spec.quote} onChange={(r) => set("conversionRate", r)} />
          </div>
        </FormSection>

        <FormSection step={3} title="Data & execution model">
          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <dt className="text-muted">Dataset</dt>
            <dd>
              {dataset.name} (v{dataset.version})
            </dd>
            <dt className="text-muted">Source time zone</dt>
            <dd>{SOURCE_TIMEZONES.find((z) => z.value === dataset.sourceTimezone)?.label ?? dataset.sourceTimezone}</dd>
            <dt className="text-muted">Price basis</dt>
            <dd>{dataset.priceBasis === "unknown" ? "Unknown — treated as mid prices" : `${dataset.priceBasis} prices`}</dd>
            <dt className="text-muted">Session range</dt>
            <dd>
              {formatInTz(session.startT, tz, "date")} → {formatInTz(session.endT, tz, "date")}
            </dd>
            <dt className="text-muted">Execution resolution</dt>
            <dd>{dataset.timeframe} candles{dataset.derivedFromTicks ? " (built from ticks)" : ""}</dd>
          </dl>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-[11.5px] text-muted">
            <li>Orders are evaluated one {dataset.timeframe} candle at a time, only after the candle they were placed on.</li>
            <li>Longs exit on bid, shorts on ask. Buy entries fill on ask, sell entries on bid.</li>
            <li>Gaps through a stop fill at the candle open. If SL and TP are both inside one {dataset.timeframe} candle, the stop is assumed to fill first (flagged “*”).</li>
            <li>The intrabar path of a {dataset.timeframe} candle is unknown — {dataset.derivedFromTicks ? "tick order inside each minute was aggregated away." : "replay cannot reproduce the original tick sequence."}</li>
          </ul>
        </FormSection>
      </div>
    </Modal>
  );
}
