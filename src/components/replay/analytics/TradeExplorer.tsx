"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { CandlestickSeries, ColorType, LineStyle, createChart, createSeriesMarkers, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import Modal from "@/components/ui/Modal";
import { aggregate } from "@/lib/replay/aggregate";
import { labelOf } from "@/lib/replay/engine";
import { resolveInstrument } from "@/lib/replay/instruments";
import { getDataset, loadBars } from "@/lib/replay/storage/repo";
import { formatDuration, formatInTz, TF_SECONDS } from "@/lib/replay/time";
import type { AnalyticsTrade } from "@/lib/replay/analytics";
import type { JournalEntry, ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { fmtR, money, tone } from "../format";

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Candles around a trade, never beyond what its session had revealed. */
function TradeChart({ trade, session }: { trade: AnalyticsTrade; session: ReplaySession }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const ds = await getDataset(session.datasetId);
        if (!ds || ds.missingCandles) throw new Error("The dataset for this session is no longer available — re-import it to view the chart.");
        const tf = trade.timeframe;
        const tfs = TF_SECONDS[tf];
        const from = Math.max(session.historyStartT, trade.entryT - tfs * 120);
        // Only candles the session had revealed (closed by its replay time).
        const to = Math.min(session.cursorT - TF_SECONDS[ds.timeframe], trade.exitT + tfs * 30);
        const base = await loadBars(ds.id, from, to);
        if (disposed || !ref.current) return;
        const bars = aggregate(base, ds.timeframe, tf, session.settings.dayBoundary);
        const profit = cssVar("--profit", "#12935a");
        const loss = cssVar("--loss", "#d9433d");
        const chart = createChart(ref.current, {
          autoSize: true,
          layout: { background: { type: ColorType.Solid, color: cssVar("--card", "#fff") }, textColor: cssVar("--muted", "#696d78"), attributionLogo: true, fontSize: 11 },
          grid: { vertLines: { color: cssVar("--chart-grid", "#eee") }, horzLines: { color: cssVar("--chart-grid", "#eee") } },
          timeScale: { timeVisible: true, secondsVisible: false, borderColor: cssVar("--border", "#ddd") },
          rightPriceScale: { borderColor: cssVar("--border", "#ddd") },
          localization: { timeFormatter: (t: Time) => formatInTz(t as number, session.displayTimezone, "datetime") },
        });
        const spec = resolveInstrument(trade.symbol);
        const digits = spec?.digits ?? 5;
        const series = chart.addSeries(CandlestickSeries, {
          upColor: profit,
          downColor: loss,
          wickUpColor: profit,
          wickDownColor: loss,
          borderVisible: false,
          priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
        });
        series.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
        const at = (t: number) => {
          let ans = bars[0]?.time ?? t;
          for (const b of bars) if (b.time <= t) ans = b.time;
          return ans as UTCTimestamp;
        };
        const markers: SeriesMarker<Time>[] = [
          {
            time: at(trade.entryT),
            position: trade.side === "buy" ? "belowBar" : "aboveBar",
            shape: trade.side === "buy" ? "arrowUp" : "arrowDown",
            color: trade.side === "buy" ? profit : loss,
            text: "Entry",
          },
          ...trade.exits.map(
            (e): SeriesMarker<Time> => ({
              time: at(e.t),
              position: trade.side === "buy" ? "aboveBar" : "belowBar",
              shape: "circle",
              color: e.net >= 0 ? profit : loss,
              text: `${e.reason.toUpperCase()} ${e.lots}`,
            }),
          ),
        ];
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        createSeriesMarkers(series, markers);
        const accent = cssVar("--accent", "#5e4ff2");
        series.createPriceLine({ price: trade.entryPrice, color: accent, lineStyle: LineStyle.Solid, lineWidth: 1, title: "Entry", axisLabelVisible: true });
        if (trade.initialSl !== null) series.createPriceLine({ price: trade.initialSl, color: loss, lineStyle: LineStyle.Dashed, lineWidth: 1, title: "Initial SL", axisLabelVisible: true });
        if (trade.initialTp !== null) series.createPriceLine({ price: trade.initialTp, color: profit, lineStyle: LineStyle.Dashed, lineWidth: 1, title: "TP", axisLabelVisible: true });
        chart.timeScale().fitContent();
        cleanup = () => chart.remove();
        setStatus("ready");
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [trade, session]);

  return (
    <div className="relative h-72 overflow-hidden rounded-xl border border-border">
      <div ref={ref} className="absolute inset-0" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading candles…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
          <AlertTriangle className="mr-2 h-4 w-4 text-warning" /> {error}
        </div>
      )}
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
