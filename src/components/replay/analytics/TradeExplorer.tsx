"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { CandlestickSeries, ColorType, LineStyle, createChart, createSeriesMarkers, type Logical, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import Modal from "@/components/ui/Modal";
import { aggregate, type ChartBar } from "@/lib/replay/aggregate";
import { labelOf } from "@/lib/replay/engine";
import { resolveInstrument } from "@/lib/replay/instruments";
import { levelStats } from "@/lib/replay/positionMath";
import { getDataset, getSession, loadBars } from "@/lib/replay/storage/repo";
import { availableTimeframes, formatDuration, formatInTz, TF_SECONDS } from "@/lib/replay/time";
import type { AnalyticsTrade } from "@/lib/replay/analytics";
import type { Bars, Drawing, JournalEntry, ReplaySession, Timeframe } from "@/lib/replay/types";
import { ChartOverlay, type Box } from "../chart/overlay";
import { cn } from "@/lib/utils";
import { fmtR, money, tone } from "../format";

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const UP = "#26c17a";
const DOWN = "#ef4f4f";
const VIEW_TFS: Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4"];

/** Largest index i with bars[i].time <= t (-1 if none). */
function indexAt(bars: ChartBar[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * The trade on a chart as it was taken: candles around it (never beyond what
 * its session had revealed), the position box from entry to exit with its
 * stop and target zones, the exit path, markers, and the drawings made on the
 * session. Switch timeframes to see the setup from higher or lower.
 */
function TradeChart({ trade, session }: { trade: AnalyticsTrade; session: ReplaySession }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ base: Bars; baseTf: Timeframe; drawings: Drawing[] } | null>(null);
  const [tf, setTf] = useState<Timeframe>(trade.timeframe);
  const boundary = session.settings.dayBoundary;
  const bars = useMemo(() => (data ? aggregate(data.base, data.baseTf, tf, boundary) : []), [data, tf, boundary]);
  const status: "loading" | "ready" | "error" = error ? "error" : !data ? "loading" : bars.length ? "ready" : "error";
  const message = error ?? (data && !bars.length ? "No candles were revealed around this trade." : null);

  // Load once per trade: base candles around it and the session's drawings.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const ds = await getDataset(session.datasetId);
        if (!ds || ds.missingCandles) throw new Error("The dataset for this session is no longer available — re-import it to view the chart.");
        const span = Math.max(TF_SECONDS[trade.timeframe], TF_SECONDS.H4) * 150;
        const from = Math.max(session.historyStartT, trade.entryT - span);
        // Only candles the session had revealed (closed by its replay time).
        const to = Math.min(session.cursorT - TF_SECONDS[ds.timeframe], trade.exitT + Math.max(TF_SECONDS[trade.timeframe], TF_SECONDS.H1) * 40);
        const [base, full] = await Promise.all([loadBars(ds.id, from, to), session.drawings.length ? Promise.resolve(session) : getSession(session.id).catch(() => null)]);
        if (disposed) return;
        setData({ base, baseTf: ds.timeframe, drawings: (full?.drawings ?? []).filter((d) => d.kind !== "long" && d.kind !== "short") });
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [trade, session]);

  // Draw (and redraw on timeframe change).
  useEffect(() => {
    if (!data || !ref.current || !bars.length) return;
    const el = ref.current;
    const tfSec = TF_SECONDS[tf];
    const timeToLogical = (t: number): number | null => {
      const n = bars.length;
      if (t > bars[n - 1].time + tfSec - 1) return n - 1 + (t - bars[n - 1].time) / tfSec;
      if (t < bars[0].time) return (t - bars[0].time) / tfSec;
      return indexAt(bars, t);
    };
    const colors = {
      font: getComputedStyle(document.body).fontFamily,
      profit: UP,
      loss: DOWN,
      accent: cssVar("--accent", "#c98a00"),
      text: cssVar("--foreground", "#121316"),
      muted: cssVar("--muted", "#62646c"),
      surface: cssVar("--card", "#ffffff"),
    };
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: colors.surface }, textColor: colors.muted, attributionLogo: true, fontSize: 11, fontFamily: colors.font },
      grid: { vertLines: { color: cssVar("--chart-grid", "#eee") }, horzLines: { color: cssVar("--chart-grid", "#eee") } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: cssVar("--border", "#ddd"), rightOffset: 4 },
      rightPriceScale: { borderColor: cssVar("--border", "#ddd") },
      crosshair: { vertLine: { labelBackgroundColor: colors.accent }, horzLine: { labelBackgroundColor: colors.accent } },
      localization: { timeFormatter: (t: Time) => formatInTz(t as number, session.displayTimezone, "datetime") },
    });
    const spec = resolveInstrument(trade.symbol);
    const digits = spec?.digits ?? 5;
    const series = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false, lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits } });
    series.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    const at = (t: number) => bars[Math.max(0, indexAt(bars, t))].time as UTCTimestamp;
    const markers: SeriesMarker<Time>[] = [
      { time: at(trade.entryT), position: trade.side === "buy" ? "belowBar" : "aboveBar", shape: trade.side === "buy" ? "arrowUp" : "arrowDown", color: trade.side === "buy" ? UP : DOWN, text: `${trade.side === "buy" ? "Buy" : "Sell"} ${trade.lots}` },
      ...trade.exits.map((e): SeriesMarker<Time> => ({ time: at(e.t), position: trade.side === "buy" ? "aboveBar" : "belowBar", shape: "circle", color: e.net >= 0 ? UP : DOWN, text: `${e.reason.toUpperCase()} ${e.lots}` })),
    ];
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(series, markers);
    if (trade.finalSl !== null && trade.finalSl !== trade.initialSl) series.createPriceLine({ price: trade.finalSl, color: "#ff9800", lineStyle: LineStyle.Dashed, lineWidth: 1, title: "Final SL", axisLabelVisible: true });

    // TradingView position box: target zone, stop zone, entry line and the path to the exit.
    const ccy = session.settings.accountCurrency;
    const stat = (level: number) => levelStats({ side: trade.side, entry: trade.entryPrice, level, lots: trade.lots, spec: spec!, accountCurrency: ccy, conversionRate: session.settings.conversionRate, balance: session.settings.initialBalance });
    const fmtMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: ccy });
    const levelText = (kind: string, level: number) => {
      const st = stat(level);
      return `${kind}: ${Math.abs(level - trade.entryPrice).toFixed(digits)} (${st.pricePct.toFixed(2)}%) ${st.pips.toFixed(1)} pips, Amount: ${fmtMoney.format(Math.abs(st.money))}`;
    };
    const overlay = new ChartOverlay();
    series.attachPrimitive(overlay);
    const box: Box = {
      id: trade.id,
      kind: "open",
      side: trade.side,
      fromT: trade.entryT,
      toT: trade.exitT,
      entry: trade.entryPrice,
      sl: trade.initialSl,
      tp: trade.initialTp,
      exitPrice: trade.exitPrice,
      targetLabel: spec && trade.initialTp !== null ? levelText("Target", trade.initialTp) : undefined,
      stopLabel: spec && trade.initialSl !== null ? levelText("Stop", trade.initialSl) : undefined,
      centerLabel: `${trade.exitReason.toUpperCase()} · ${money(trade.netPnl, ccy, { signed: true })} · ${fmtR(trade.rMultiple)}\n${trade.lots.toFixed(2)} lots · held ${formatDuration(trade.holdingSeconds)}`,
      centerColor: trade.netPnl >= 0 ? UP : DOWN,
    };
    overlay.update({
      boxes: [box],
      pills: [],
      drawings: data.drawings,
      draft: null,
      selectedId: null,
      hideDrawings: false,
      sessionBands: [],
      barsBetween: (t1, t2) => {
        const a = timeToLogical(Math.min(t1, t2));
        const b = timeToLogical(Math.max(t1, t2));
        return a === null || b === null ? 0 : Math.round(b - a);
      },
      pipSize: spec?.pipSize ?? 0.0001,
      digits,
      edgeT: null,
      axisLabels: [
        { price: trade.entryPrice, text: trade.entryPrice.toFixed(digits), color: "#787b86" },
        ...(trade.initialTp !== null ? [{ price: trade.initialTp, text: trade.initialTp.toFixed(digits), color: UP }] : []),
        ...(trade.initialSl !== null ? [{ price: trade.initialSl, text: trade.initialSl.toFixed(digits), color: DOWN }] : []),
      ],
      timeSpan: null,
      colors,
      timeToX: (t) => {
        const l = timeToLogical(t);
        return l === null ? null : chart.timeScale().logicalToCoordinate(l as Logical);
      },
      barSpacing: () => chart.timeScale().options().barSpacing,
    });
    // Frame the trade with some context on both sides.
    const a = timeToLogical(trade.entryT) ?? 0;
    const b = timeToLogical(trade.exitT) ?? bars.length - 1;
    const pad = Math.max(25, (b - a) * 0.8);
    chart.timeScale().setVisibleLogicalRange({ from: a - pad * 1.6, to: b + pad });
    return () => chart.remove();
  }, [data, bars, tf, trade, session]);

  const tfs = data ? availableTimeframes(data.baseTf).filter((t) => VIEW_TFS.includes(t)) : [];
  return (
    <div>
      {tfs.length > 1 && (
        <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Chart timeframe">
          {tfs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === tf} onClick={() => setTf(t)} className={cn("h-7 rounded-md px-2 text-xs font-semibold", t === tf ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted">As taken in the replay — no candles after what the session revealed.</span>
        </div>
      )}
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-border" data-testid="trade-chart">
        <div ref={ref} className="absolute inset-0" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading candles…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
            <AlertTriangle className="mr-2 h-4 w-4 text-warning" /> {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TradeExplorer({
  trade,
  session,
  journal,
  onClose,
}: {
  trade: AnalyticsTrade | null;
  session: ReplaySession | null;
  journal?: JournalEntry;
  onClose: () => void;
}) {
  if (!trade || !session) return null;
  const ccy = session.settings.accountCurrency;
  const spec = resolveInstrument(trade.symbol);
  const d = spec?.digits ?? 5;
  const p = (x: number | null) => (x === null ? "—" : x.toFixed(d));
  const rows: [string, React.ReactNode][] = [
    ["Session", <Link key="s" href={`/replay/session/${session.id}`} className="text-accent hover:underline">{session.name}</Link>],
    ["Direction", trade.side === "buy" ? "▲ Long" : "▼ Short"],
    ["Order type", labelOf(trade.orderType)],
    ["Timeframe", trade.timeframe],
    ["Size", `${trade.lots.toFixed(2)} lots`],
    ["Entry", `${p(trade.entryPrice)} · ${formatInTz(trade.entryT, session.displayTimezone, "datetime")}`],
    ["Exit (avg)", `${p(trade.exitPrice)} · ${formatInTz(trade.exitT, session.displayTimezone, "datetime")}`],
    ["Exit reason", `${trade.exitReason.toUpperCase()}${trade.ambiguous ? " — SL & TP in the same candle, stop assumed first" : ""}`],
    ["Initial stop / target", `${p(trade.initialSl)} / ${p(trade.initialTp)}`],
    ["Final stop", p(trade.finalSl)],
    ["Initial risk", money(trade.initialRisk, ccy)],
    ["Gross P&L", money(trade.grossPnl, ccy, { signed: true })],
    ["Commission", money(trade.commission, ccy)],
    ["Net P&L", <span key="n" className={cn("font-semibold", tone(trade.netPnl))}>{money(trade.netPnl, ccy, { signed: true })}</span>],
    ["R-multiple", <span key="r" className={tone(trade.rMultiple)}>{fmtR(trade.rMultiple)}</span>],
    ["Pips", trade.pips.toFixed(1)],
    ["Held", formatDuration(trade.holdingSeconds)],
    ["MAE / MFE", spec ? `${(trade.mae / spec.pipSize).toFixed(1)} / ${(trade.mfe / spec.pipSize).toFixed(1)} pips` : "—"],
    ["Spread at entry", spec ? `${(trade.spreadAtEntry / spec.pipSize).toFixed(1)} pips` : "—"],
    ["Conversion", trade.exactConversion ? "Exact" : "Fixed rate (approximate)"],
  ];
  const j = journal ?? {};
  return (
    <Modal open onClose={onClose} title={`${trade.symbol} ${trade.side === "buy" ? "long" : "short"} · ${fmtR(trade.rMultiple)}`} subtitle={`Trade ${trade.id}`} icon={Search} size="xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <TradeChart trade={trade} session={session} />
          {trade.exits.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Exits</div>
              <table className="w-full text-xs">
                <tbody>
                  {trade.exits.map((e, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1 tabular-nums text-muted">{formatInTz(e.t, session.displayTimezone, "short")}</td>
                      <td className="uppercase">{e.reason}</td>
                      <td className="text-right tabular-nums">{e.lots.toFixed(2)} lots</td>
                      <td className="text-right tabular-nums">{e.price.toFixed(d)}</td>
                      <td className={cn("text-right tabular-nums", tone(e.net))}>{money(e.net, ccy, { signed: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(j.notes || j.preTrade || j.postTrade || j.entryRationale || j.exitRationale || j.lessons || j.screenshot) && (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              {(
                [
                  ["Note", j.notes],
                  ["Pre-trade", j.preTrade],
                  ["Entry rationale", j.entryRationale],
                  ["Exit rationale", j.exitRationale],
                  ["Post-trade", j.postTrade],
                  ["Lessons", j.lessons],
                ] as [string, string | undefined][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</div>
                    <p className="prose-note text-[0.82rem]">{v}</p>
                  </div>
                ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {j.screenshot && <img src={j.screenshot} alt="Chart screenshot attached to this trade" className="rounded-lg border border-border" />}
            </div>
          )}
        </div>
        <div>
          <dl className="divide-y divide-border rounded-xl border border-border text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-1.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1">
            {trade.strategy && <span className="chip !py-0.5 text-[11px]">{trade.strategy}</span>}
            {trade.setup !== "Unspecified" && <span className="chip !py-0.5 text-[11px]">{trade.setup}</span>}
            {trade.tags.map((t) => (
              <span key={t} className="chip !py-0.5 text-[11px]">
                #{t}
              </span>
            ))}
          </div>
          {(j.mistakes?.length || j.emotion || j.confidence) && (
            <p className="mt-2 text-[11.5px] text-muted">
              {j.confidence ? `Confidence ${j.confidence}/5. ` : ""}
              {j.emotion ? `Felt ${j.emotion.toLowerCase()}. ` : ""}
              {j.mistakes?.length ? `Mistakes: ${j.mistakes.join(", ")}.` : ""}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
