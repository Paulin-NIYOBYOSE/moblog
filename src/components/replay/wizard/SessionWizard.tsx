"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CloudDownload, Database, HardDrive, Loader2, Search, Star } from "lucide-react";
import { Field } from "@/components/ui/Modal";
import { TagInput } from "@/components/ui/Inputs";
import { useToast } from "@/components/ToastContext";
import { DEFAULT_SPREAD_PIPS, PRIMARY_SYMBOLS, resolveInstrument, needsConversionRate, conversionPair } from "@/lib/replay/instruments";
import { checkAvailability, suggestConversionRate, type Availability } from "@/lib/replay/marketData";
import { FXCM, fxcmEarliestT, fxcmSupports, latestPublishedSunday } from "@/lib/replay/providers/fxcm";
import { createProviderSession, createSession, defaultSettings } from "@/lib/replay/session";
import { getInstrumentPrefs, saveInstrumentPrefs, saveSession, type InstrumentPrefs } from "@/lib/replay/storage/repo";
import { availableTimeframes, TF_LABEL } from "@/lib/replay/time";
import type { DatasetMeta, RiskMode, SessionSettings, Timeframe } from "@/lib/replay/types";
import { notifyReplayChanged, useDatasets, useStrategies } from "@/lib/replay/useReplayData";
import { cn, CURRENCIES } from "@/lib/utils";

const DAY = 86_400;
const PRESETS: { id: string; label: string; days: number }[] = [
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "3m", label: "3 months", days: 91 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "2y", label: "2 years", days: 730 },
  { id: "5y", label: "5 years", days: 1826 },
];
const WIZARD_TFS: Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const STEPS = ["Market", "Period & timeframe", "Trading settings", "Review"];

const toDateInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const fromDateInput = (v: string, endOfDay = false) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 + (endOfDay ? DAY - 60 : 0);
};
const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

type Source = { kind: "provider" } | { kind: "import"; dataset: DatasetMeta };

/** Latest Friday close the provider is expected to have published. */
function providerLatestEnd(nowSec: number) {
  return latestPublishedSunday(nowSec) + 5 * DAY + 22 * 3600;
}

function StepHeader({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold",
              i < step ? "border-accent bg-accent text-accent-foreground" : i === step ? "border-accent text-accent" : "border-border text-faint",
            )}
          >
            {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cn("font-medium", i === step ? "text-foreground" : "text-muted")}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

export default function SessionWizard({ initialSymbol, initialDatasetId }: { initialSymbol?: string | null; initialDatasetId?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { datasets } = useDatasets();
  const { strategies } = useStrategies();
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));
  const latestEnd = providerLatestEnd(nowSec);

  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<InstrumentPrefs>({ favorites: [], recent: [] });
  const [query, setQuery] = useState("");
  const [symbol, setSymbol] = useState<string | null>(initialSymbol ?? null);
  const [source, setSource] = useState<Source>({ kind: "provider" });
  const [timeframe, setTimeframe] = useState<Timeframe>("M15");
  const [resolution, setResolution] = useState<Timeframe>("M1");
  const [preset, setPreset] = useState("3m");
  const [fromDate, setFromDate] = useState(toDateInput(latestEnd - 91 * DAY));
  const [toDate, setToDate] = useState(toDateInput(latestEnd));
  const [historyDays, setHistoryDays] = useState(30);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SessionSettings>(() => ({ ...defaultSettings({ symbol: "EURUSD", hasSpread: true }), spreadMode: "recorded" }));
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [replayStart, setReplayStart] = useState<"start" | "custom">("start");
  const [replayStartDate, setReplayStartDate] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [rateHint, setRateHint] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const checkSeq = useRef(0);
  const rateSeq = useRef(0);

  useEffect(() => {
    void getInstrumentPrefs()
      .then(setPrefs)
      .catch(() => undefined);
  }, []);


  const spec = symbol ? resolveInstrument(symbol) : null;
  const importedFor = (sym: string) => datasets.filter((d) => d.symbol === sym && !d.missingCandles);
  const fromT = fromDateInput(fromDate);
  const toT = fromDateInput(toDate, true);
  const rangeFrom = source.kind === "import" ? source.dataset.firstT : fxcmEarliestT();
  const rangeTo = source.kind === "import" ? source.dataset.lastT : latestEnd;
  const tfOptions = source.kind === "import" ? availableTimeframes(source.dataset.timeframe).filter((t) => WIZARD_TFS.includes(t)) : WIZARD_TFS;

  // ---- Instruments -------------------------------------------------------
  const allSymbols = useMemo(() => {
    const set = new Set<string>([...PRIMARY_SYMBOLS, ...FXCM.instruments, ...datasets.map((d) => d.symbol)]);
    return Array.from(set);
  }, [datasets]);
  const filtered = allSymbols.filter((s) => {
    const q = query.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!q) return true;
    const desc = resolveInstrument(s)?.description.toUpperCase() ?? "";
    return s.includes(q) || desc.replace(/[^A-Z]/g, "").includes(q);
  });
  const groups: { label: string; items: string[] }[] = query
    ? [{ label: "Results", items: filtered }]
    : [
        { label: "Favorites", items: prefs.favorites.filter((s) => allSymbols.includes(s)) },
        { label: "Recent", items: prefs.recent.filter((s) => allSymbols.includes(s) && !prefs.favorites.includes(s)) },
        { label: "Major pairs & gold", items: PRIMARY_SYMBOLS },
        { label: "More FX crosses", items: FXCM.instruments.filter((s) => !PRIMARY_SYMBOLS.includes(s)) },
        { label: "Imported only", items: Array.from(new Set(datasets.map((d) => d.symbol))).filter((s) => !FXCM.instruments.includes(s) && !PRIMARY_SYMBOLS.includes(s)) },
      ].filter((g) => g.items.length);

  const toggleFavorite = (s: string) => {
    const next = { ...prefs, favorites: prefs.favorites.includes(s) ? prefs.favorites.filter((x) => x !== s) : [s, ...prefs.favorites] };
    setPrefs(next);
    void saveInstrumentPrefs(next);
  };

  const chooseSymbol = (s: string) => {
    setSymbol(s);
    const imported = importedFor(s);
    const auto = fxcmSupports(s, "M1");
    const nextSource: Source = auto ? { kind: "provider" } : imported.length ? { kind: "import", dataset: imported[0] } : { kind: "provider" };
    setSource(nextSource);
    setSettings((st) => ({ ...st, spreadPips: DEFAULT_SPREAD_PIPS[s] ?? 1.5, spreadMode: nextSource.kind === "provider" || (nextSource.kind === "import" && nextSource.dataset.hasSpread) ? "recorded" : "fixed", conversionRate: null }));
    setRateHint(null);
    if (nextSource.kind === "import") applyPreset("3m", nextSource.dataset.lastT, nextSource.dataset.firstT);
  };

  const applyPreset = (id: string, end = rangeTo, start = rangeFrom) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setToDate(toDateInput(end));
    setFromDate(toDateInput(Math.max(start, end - p.days * DAY)));
  };

  // Opened from the Datasets page: preselect that imported dataset.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !initialDatasetId) return;
    const ds = datasets.find((d) => d.id === initialDatasetId && !d.missingCandles);
    if (!ds) return;
    preselected.current = true;
    // One-time sync from the URL once datasets have loaded from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSymbol(ds.symbol);
    setSource({ kind: "import", dataset: ds });
    applyPreset("3m", ds.lastT, ds.firstT);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, initialDatasetId]);

  // ---- Availability check (debounced) -----------------------------------
  useEffect(() => {
    if (step !== 1 || !symbol || source.kind !== "provider" || fromT === null || toT === null || toT <= fromT) return;
    const seq = ++checkSeq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setChecking(true);
      setCheckError(null);
      try {
        const a = await checkAvailability({ provider: "fxcm", symbol, resolution, fromT: fromT - historyDays * DAY, toT }, { signal: ctrl.signal });
        if (seq === checkSeq.current) setAvail(a);
      } catch (e) {
        if (seq === checkSeq.current && !(e instanceof DOMException)) setCheckError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [step, symbol, source.kind, resolution, fromT, toT, historyDays]);

  // Prefill the conversion rate for crosses from the conversion pair's real data.
  const lookupRate = (currency: string) => {
    if (!spec || !needsConversionRate(spec, currency) || fromT === null) return;
    const seq = ++rateSeq.current;
    setRateHint("Looking up a conversion rate from FXCM…");
    suggestConversionRate(spec.symbol, currency, fromT)
      .then((r) => {
        if (seq !== rateSeq.current) return;
        if (r) {
          setSettings((st) => (st.conversionRate ? st : { ...st, conversionRate: r.rate }));
          setRateHint(`Prefilled from FXCM ${r.pair} ≈ ${r.pairPrice.toFixed(r.pair.endsWith("JPY") ? 3 : 5)} (average of the week before the start). Edit if you prefer another rate.`);
        } else setRateHint(null);
      })
      .catch(() => seq === rateSeq.current && setRateHint(null));
  };

  // ---- Validation --------------------------------------------------------
  const sourceAvailable = !!symbol && (source.kind === "import" || fxcmSupports(symbol, "M1"));
  const periodErrors: string[] = [];
  if (fromT === null || toT === null) periodErrors.push("Choose a start and end date.");
  else if (toT <= fromT) periodErrors.push("The end date must be after the start date.");
  else if (source.kind === "import" && (fromT > source.dataset.lastT || toT < source.dataset.firstT)) periodErrors.push("The period is outside the imported dataset's coverage.");
  if (source.kind === "provider") {
    if (avail && !avail.supported) periodErrors.push(avail.reason ?? "No data available for this period.");
    if (!avail && !checking && !checkError) periodErrors.push("Checking availability…");
    if (checking) periodErrors.push("Checking availability…");
  }
  const finalFrom = source.kind === "provider" && avail?.supported ? Math.max(fromT ?? 0, avail.fromT) : fromT ?? 0;
  const finalTo = source.kind === "provider" && avail?.supported ? Math.min(toT ?? 0, avail.toT) : toT ?? 0;
  const startT = replayStart === "custom" ? fromDateInput(replayStartDate) ?? finalFrom : finalFrom;
  const settingsErrors: string[] = [];
  if (!(settings.initialBalance > 0)) settingsErrors.push("Starting balance must be positive.");
  if (settings.riskMode === "percent" && !(settings.riskPercent > 0)) settingsErrors.push("Risk % must be positive.");
  if (spec && needsConversionRate(spec, settings.accountCurrency) && !settings.conversionRate) settingsErrors.push(`Enter the ${conversionPair(spec, settings.accountCurrency).pair} conversion rate.`);
  if (replayStart === "custom" && (startT < finalFrom || startT >= finalTo)) settingsErrors.push("The replay start must be inside the period.");
  const canNext = step === 0 ? sourceAvailable : step === 1 ? periodErrors.length === 0 : step === 2 ? settingsErrors.length === 0 : true;
  const defaultName = symbol ? `${symbol} ${timeframe} · ${fromDate.slice(0, 7)}` : "";

  // ---- Create ------------------------------------------------------------
  const start = async () => {
    if (!symbol) return;
    setCreating(true);
    try {
      const historyStartT = Math.max(rangeFrom, finalFrom - historyDays * DAY);
      const s =
        source.kind === "provider"
          ? createProviderSession({
              name: name || defaultName,
              strategy,
              description,
              tags,
              symbol,
              resolution,
              timeframe,
              historyStartT,
              startT,
              endT: finalTo,
              settings,
              displayTimezone: "UTC",
            })
          : {
              ...createSession({
                name: name || defaultName,
                strategy,
                dataset: source.dataset,
                timeframe,
                startT,
                endT: Math.min(finalTo, source.dataset.lastT),
                historyMonths: Math.ceil(historyDays / 31),
                settings,
                displayTimezone: "UTC",
              }),
              description: description.trim() || undefined,
              tags: tags.length ? tags : undefined,
              source: { kind: "import" as const },
            };
      await saveSession(s);
      const next = { ...prefs, recent: [symbol, ...prefs.recent.filter((x) => x !== symbol)] };
      void saveInstrumentPrefs(next);
      notifyReplayChanged();
      router.push(`/replay/session/${s.id}/chart`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  // ---- Render ------------------------------------------------------------
  const set = <K extends keyof SessionSettings>(k: K, v: SessionSettings[K]) => setSettings((st) => ({ ...st, [k]: v }));
  const providerBadge = (s: string) => {
    if (fxcmSupports(s, "M1")) return <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">Auto-download · {FXCM.firstYear}–now</span>;
    if (importedFor(s).length) return <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">Imported data</span>;
    return <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-muted">Import a CSV first</span>;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Link href="/replay" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Sessions
          </Link>
          <h1 className="font-display text-[2rem] leading-tight tracking-tight">New backtesting session</h1>
          <p className="mt-1 text-sm text-muted">Pick a market and a period — historical data is downloaded automatically and stored in your database.</p>
        </div>
      </div>
      <StepHeader step={step} />

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        {step === 0 && (
          <div>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                className="input pl-9"
                placeholder="Search EURUSD, Japanese yen, pound…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search instruments"
                data-testid="wizard-search"
              />
            </div>
            <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{g.label}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.items.map((s) => {
                      const ins = resolveInstrument(s);
                      const selected = symbol === s;
                      const disabled = !fxcmSupports(s, "M1") && !importedFor(s).length;
                      return (
                        <div
                          key={`${g.label}-${s}`}
                          className={cn(
                            "group flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors",
                            selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
                            disabled && "opacity-60",
                          )}
                        >
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => chooseSymbol(s)} data-testid={`instrument-${s}`}>
                            <span className="w-16 shrink-0 text-sm font-bold tracking-wide">{s}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs text-muted">{ins?.description ?? s}</span>
                              <span className="mt-0.5 block">{providerBadge(s)}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(s)}
                            className={cn("rounded p-1", prefs.favorites.includes(s) ? "text-gold" : "text-faint opacity-0 group-hover:opacity-100")}
                            aria-label={prefs.favorites.includes(s) ? `Remove ${s} from favorites` : `Add ${s} to favorites`}
                          >
                            <Star className="h-4 w-4" fill={prefs.favorites.includes(s) ? "currentColor" : "none"} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {symbol && !sourceAvailable && (
              <p className="mt-3 flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {symbol} isn’t in FXCM’s free archive. <Link href="/replay/datasets" className="underline">Import a CSV</Link> (HistData has XAU/USD) and it will appear here.
              </p>
            )}
          </div>
        )}

        {step === 1 && symbol && (
          <div className="space-y-5">
            {(importedFor(symbol).length > 0 || fxcmSupports(symbol, "M1")) && (
              <Field label="Data source">
                <div className="flex flex-wrap gap-2">
                  {fxcmSupports(symbol, "M1") && (
                    <button
                      type="button"
                      className="chip"
                      data-active={source.kind === "provider"}
                      onClick={() => {
                        setSource({ kind: "provider" });
                        applyPreset(preset, latestEnd, fxcmEarliestT());
                      }}
                    >
                      <CloudDownload className="h-3.5 w-3.5" /> FXCM — automatic download
                    </button>
                  )}
                  {importedFor(symbol).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="chip"
                      data-active={source.kind === "import" && source.dataset.id === d.id}
                      onClick={() => {
                        setSource({ kind: "import", dataset: d });
                        applyPreset(preset, d.lastT, d.firstT);
                        if (!availableTimeframes(d.timeframe).includes(timeframe)) setTimeframe(availableTimeframes(d.timeframe)[0]);
                      }}
                    >
                      <Database className="h-3.5 w-3.5" /> {d.name}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Period" hint="Presets are shortcuts — the coverage check below confirms what actually exists.">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" className="chip" data-active={preset === p.id} onClick={() => applyPreset(p.id)}>
                    {p.label}
                  </button>
                ))}
                <button type="button" className="chip" data-active={preset === "custom"} onClick={() => setPreset("custom")}>
                  Custom
                </button>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="From (UTC)">
                <input type="date" className="input" value={fromDate} min={toDateInput(rangeFrom)} max={toDateInput(rangeTo)} onChange={(e) => (setPreset("custom"), setFromDate(e.target.value))} data-testid="wizard-from" />
              </Field>
              <Field label="To (UTC)">
                <input type="date" className="input" value={toDate} min={fromDate} max={toDateInput(rangeTo)} onChange={(e) => (setPreset("custom"), setToDate(e.target.value))} data-testid="wizard-to" />
              </Field>
              <Field label="History before the start" hint="Shown on the chart for context.">
                <select className="input" value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}>
                  <option value={0}>None</option>
                  <option value={7}>1 week</option>
                  <option value={30}>1 month</option>
                  <option value={91}>3 months</option>
                </select>
              </Field>
            </div>
            <Field label="Chart timeframe" hint="You can switch any time during replay without losing your place.">
              <div className="flex flex-wrap gap-1.5" role="radiogroup">
                {WIZARD_TFS.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    role="radio"
                    aria-checked={timeframe === tf}
                    disabled={!tfOptions.includes(tf)}
                    className="chip disabled:opacity-40"
                    data-active={timeframe === tf}
                    onClick={() => {
                      setTimeframe(tf);
                      if (tf === "M1" || tf === "M5" || tf === "M15" || tf === "M30") setResolution("M1");
                    }}
                    title={TF_LABEL[tf]}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </Field>
            {source.kind === "provider" && (
              <Field label="Execution data" hint="Orders are simulated on these candles. 1-minute data gives precise fills; 1-hour data downloads ~40× less.">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="chip" data-active={resolution === "M1"} onClick={() => setResolution("M1")}>
                    1-minute (precise)
                  </button>
                  <button
                    type="button"
                    className="chip disabled:opacity-40"
                    data-active={resolution === "H1"}
                    disabled={["M1", "M5", "M15", "M30"].includes(timeframe)}
                    onClick={() => setResolution("H1")}
                    title={["M1", "M5", "M15", "M30"].includes(timeframe) ? "Needs a chart timeframe of H1 or above" : undefined}
                  >
                    1-hour (light)
                  </button>
                </div>
              </Field>
            )}

            {/* Coverage preview */}
            <div className="rounded-xl border border-border bg-surface-2/50 p-4" data-testid="coverage-preview">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wider text-muted">Coverage</span>
                {checking && (
                  <span className="flex items-center gap-1.5 text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking with FXCM…
                  </span>
                )}
              </div>
              <CoverageBar rangeFrom={rangeFrom} rangeTo={rangeTo} fromT={fromT ?? rangeFrom} toT={toT ?? rangeTo} />
              <div className="mt-1 flex justify-between text-[10.5px] text-faint">
                <span>{fmtDate(rangeFrom)}</span>
                <span>{source.kind === "provider" ? `≈ ${fmtDate(rangeTo)} (latest published)` : fmtDate(rangeTo)}</span>
              </div>
              {source.kind === "import" ? (
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-profit" /> Imported data — already in the database ({source.dataset.count.toLocaleString()} {source.dataset.timeframe} candles).
                </p>
              ) : avail && avail.supported ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Weeks needed</div>
                    <div className="font-semibold tabular-nums">{avail.chunksTotal}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Already stored</div>
                    <div className="font-semibold tabular-nums">{avail.chunksCached}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">To download</div>
                    <div className="font-semibold tabular-nums">
                      {avail.chunksToDownload} week{avail.chunksToDownload === 1 ? "" : "s"}
                      {avail.estimatedBytes !== null && avail.chunksToDownload > 0 && <span className="font-normal text-muted"> · ≈ {bytes(avail.estimatedBytes)}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted sm:col-span-3">
                    ≈ {avail.estimatedCandles.toLocaleString()} {resolution} candles (≈ {bytes(avail.estimatedCandles * 10)} of database storage), bid + ask prices, UTC. Source: {FXCM.name}.
                  </p>
                </div>
              ) : null}
              {checkError && <p className="mt-2 text-sm text-loss">{checkError}</p>}
              {avail?.warnings.map((w) => (
                <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                </p>
              ))}
              {avail && !avail.supported && <p className="mt-2 text-sm text-loss">{avail.reason}</p>}
            </div>
          </div>
        )}

        {step === 2 && spec && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Session name">
                <input className="input" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} data-testid="wizard-name" />
              </Field>
              <Field label="Starting balance">
                <input className="input tabular-nums" type="number" min={1} value={settings.initialBalance} onChange={(e) => set("initialBalance", Number(e.target.value))} data-testid="wizard-balance" />
              </Field>
              <Field label="Account currency">
                <select
                  className="input"
                  value={settings.accountCurrency}
                  onChange={(e) => {
                    set("accountCurrency", e.target.value);
                    set("conversionRate", null);
                    lookupRate(e.target.value);
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default position sizing">
                <select className="input" value={settings.riskMode} onChange={(e) => set("riskMode", e.target.value as RiskMode)}>
                  <option value="percent">% of equity at risk</option>
                  <option value="money">Fixed {settings.accountCurrency} at risk</option>
                  <option value="lots">Fixed lots</option>
                </select>
              </Field>
              {settings.riskMode === "percent" && (
                <Field label="Risk per trade (%)">
                  <input className="input tabular-nums" type="number" min={0.01} step={0.1} value={settings.riskPercent} onChange={(e) => set("riskPercent", Number(e.target.value))} data-testid="wizard-risk" />
                </Field>
              )}
              {settings.riskMode === "money" && (
                <Field label={`Risk per trade (${settings.accountCurrency})`}>
                  <input className="input tabular-nums" type="number" min={1} value={settings.riskMoney} onChange={(e) => set("riskMoney", Number(e.target.value))} />
                </Field>
              )}
              {settings.riskMode === "lots" && (
                <Field label="Lots per trade">
                  <input className="input tabular-nums" type="number" min={0.01} step={0.01} value={settings.fixedLots} onChange={(e) => set("fixedLots", Number(e.target.value))} />
                </Field>
              )}
              <Field label="Spread" hint={settings.spreadMode === "recorded" ? "Real bid/ask from the data (FXCM's are tight: often 0.1–0.3 pip on majors)." : "Applied to every fill."}>
                <div className="flex gap-1.5">
                  <select className="input" value={settings.spreadMode} onChange={(e) => set("spreadMode", e.target.value as SessionSettings["spreadMode"])} disabled={source.kind === "import" && !source.dataset.hasSpread}>
                    <option value="recorded">Historical</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  {settings.spreadMode === "fixed" && (
                    <input className="input !w-24 tabular-nums" type="number" min={0} step={0.1} value={settings.spreadPips} onChange={(e) => set("spreadPips", Number(e.target.value))} aria-label="Fixed spread in pips" />
                  )}
                </div>
              </Field>
            </div>
            {needsConversionRate(spec, settings.accountCurrency) && (
              <Field label={`${conversionPair(spec, settings.accountCurrency).pair} rate (converts ${spec.quote} P&L to ${settings.accountCurrency})`} hint={rateHint ?? "A single fixed rate is used; money values for this cross are marked approximate."}>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="any"
                  min={0}
                  value={settings.conversionRate ? +(conversionPair(spec, settings.accountCurrency).invert ? 1 / settings.conversionRate : settings.conversionRate).toFixed(6) : ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set("conversionRate", v > 0 ? (conversionPair(spec, settings.accountCurrency).invert ? 1 / v : v) : null);
                  }}
                />
              </Field>
            )}
            <button type="button" className="flex items-center gap-1.5 text-sm font-medium text-accent" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", advanced && "rotate-180")} /> Advanced settings
            </button>
            {advanced && (
              <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
                <Field label="Slippage (pips)" hint="Adverse; market & stop fills.">
                  <input className="input tabular-nums" type="number" min={0} step={0.1} value={settings.slippagePips} onChange={(e) => set("slippagePips", Math.max(0, Number(e.target.value)))} />
                </Field>
                <Field label={`Commission (${settings.accountCurrency}/lot round turn)`}>
                  <input className="input tabular-nums" type="number" min={0} step={0.5} value={settings.commissionPerLot} onChange={(e) => set("commissionPerLot", Math.max(0, Number(e.target.value)))} />
                </Field>
                <Field label="Trading day boundary">
                  <select className="input" value={settings.dayBoundary} onChange={(e) => set("dayBoundary", e.target.value as SessionSettings["dayBoundary"])}>
                    <option value="ny-close">17:00 New York</option>
                    <option value="utc">00:00 UTC</option>
                  </select>
                </Field>
                <Field label="Strategy">
                  <input className="input" list="wizard-strategies" value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Optional" />
                  <datalist id="wizard-strategies">
                    {strategies.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Replay starts" className="sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="chip" data-active={replayStart === "start"} onClick={() => setReplayStart("start")}>
                      At the start of the period
                    </button>
                    <button
                      type="button"
                      className="chip"
                      data-active={replayStart === "custom"}
                      onClick={() => {
                        setReplayStart("custom");
                        if (!replayStartDate) setReplayStartDate(toDateInput(finalFrom));
                      }}
                    >
                      On a date
                    </button>
                    {replayStart === "custom" && <input type="date" className="input !w-auto" value={replayStartDate} min={toDateInput(finalFrom)} max={toDateInput(finalTo)} onChange={(e) => setReplayStartDate(e.target.value)} />}
                  </div>
                </Field>
                <Field label="Description" className="sm:col-span-3">
                  <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you testing?" />
                </Field>
                <Field label="Tags" className="sm:col-span-3">
                  <TagInput value={tags} onChange={setTags} />
                </Field>
              </div>
            )}
            {settingsErrors.length > 0 && <p className="text-sm text-loss">{settingsErrors[0]}</p>}
          </div>
        )}

        {step === 3 && spec && (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {(
                [
                  ["Market", `${spec.symbol} — ${spec.description}`],
                  ["Data", source.kind === "provider" ? `${FXCM.name}, ${resolution} bid/ask, UTC` : `${source.dataset.name} (imported)`],
                  ["Period", `${fmtDate(finalFrom)} → ${fmtDate(finalTo)}`],
                  ["Replay starts", fmtDate(startT)],
                  ["Chart timeframe", `${timeframe} — ${TF_LABEL[timeframe]}`],
                  ["History before start", historyDays ? `${historyDays} days` : "None"],
                  ["Account", `${settings.initialBalance.toLocaleString()} ${settings.accountCurrency}`],
                  ["Sizing", settings.riskMode === "percent" ? `${settings.riskPercent}% risk per trade` : settings.riskMode === "money" ? `${settings.riskMoney} ${settings.accountCurrency} risk per trade` : `${settings.fixedLots} lots`],
                  ["Costs", `${settings.spreadMode === "recorded" ? "historical spread" : `${settings.spreadPips} pip spread`} · ${settings.slippagePips} pip slippage · ${settings.commissionPerLot} ${settings.accountCurrency}/lot commission`],
                  ["Name", name || defaultName],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/70 py-1.5 sm:block sm:border-0 sm:py-0">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-right font-medium sm:text-left">{v}</dd>
                </div>
              ))}
            </dl>
            {source.kind === "provider" && avail?.supported && (
              <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">
                <CloudDownload className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {avail.chunksToDownload
                  ? `${avail.chunksToDownload} week${avail.chunksToDownload === 1 ? "" : "s"} will be downloaded${avail.estimatedBytes ? ` (≈ ${bytes(avail.estimatedBytes)})` : ""} and stored in your database; ${avail.chunksCached} are already stored.`
                  : "All required history is already stored in your database."}
              </p>
            )}
            <p className="text-xs text-muted">{FXCM.terms}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => (step === 0 ? router.push("/replay") : setStep(step - 1))}>
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canNext}
            onClick={() => {
              if (step === 1 && !settings.conversionRate) lookupRate(settings.accountCurrency);
              setStep(step + 1);
            }}
            data-testid="wizard-next"
          >
            {step === 1 && checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={creating} onClick={() => void start()} data-testid="wizard-start">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Start backtesting
          </button>
        )}
      </div>
      {step === 1 && periodErrors.length > 0 && !checking && <p className="mt-2 text-right text-xs text-loss">{periodErrors[0]}</p>}
    </div>
  );
}

function CoverageBar({ rangeFrom, rangeTo, fromT, toT }: { rangeFrom: number; rangeTo: number; fromT: number; toT: number }) {
  const span = Math.max(1, rangeTo - rangeFrom);
  const left = Math.max(0, Math.min(100, ((fromT - rangeFrom) / span) * 100));
  const right = Math.max(0, Math.min(100, ((toT - rangeFrom) / span) * 100));
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-surface-3" aria-label="Selected period within the available history">
      <div className="absolute inset-y-0 rounded-full bg-accent/80" style={{ left: `${left}%`, width: `${Math.max(0.8, right - left)}%` }} />
    </div>
  );
}
