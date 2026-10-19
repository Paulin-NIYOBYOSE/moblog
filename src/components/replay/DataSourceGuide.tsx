"use client";

import { ExternalLink } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import { BookOpen } from "lucide-react";

const SOURCES: { name: string; url: string | null; what: string; how: string[]; note: string }[] = [
  {
    name: "HistData.com",
    url: "https://www.histdata.com/download-free-forex-data/",
    what: "Free M1 bars and tick data for 66 instruments (majors, crosses, XAU/USD…), bid prices, timestamps in EST without daylight saving.",
    how: [
      "Open the download page, pick Generic ASCII (or MetaTrader) → 1-minute bar quotes → your pair.",
      "Download a year (or month) — you get a .zip containing DAT_ASCII_EURUSD_M1_2024.csv.",
      "Import the .zip or the .csv here. Format, time zone (UTC−5) and bid basis are detected automatically.",
    ],
    note: "Manual download only. No API key. Data is provided without warranty; redistribution rights are not granted, so Replay never bundles or shares it.",
  },
  {
    name: "Dukascopy Historical Data Export",
    url: "https://www.dukascopy.com/swiss/english/marketwatch/historical/",
    what: "Tick to monthly candles for forex, metals and indices. You choose bid or ask, the timeframe and GMT or local time.",
    how: [
      "Use the export widget (it may ask you to sign in with a free Dukascopy account).",
      "Choose the instrument, 1 minute candles, Bid, GMT time and CSV.",
      "Import the file here — columns, DD.MM.YYYY timestamps and BID/ASK (from the file name) are detected.",
    ],
    note: "Manual download only. Replay does not call Dukascopy's undocumented datafeed endpoints.",
  },
  {
    name: "Your broker's MetaTrader history",
    url: null,
    what: "MT4/MT5 can export bars from a free demo account (History Center / Symbols → Bars → Export).",
    how: [
      "Export M1 bars to CSV.",
      "Import here and confirm the source time zone (usually broker server time, GMT+2/+3).",
    ],
    note: "Broker data is bid-based; the SPREAD column (in points) is used when present.",
  },
];

export default function DataSourceGuide({ compact = false }: { compact?: boolean }) {
  return (
    <Card>
      <CardHeader icon={BookOpen} title="Where to get free historical data" subtitle="Replay never fabricates prices — every candle comes from a file you import." />
      <div className={compact ? "space-y-3" : "grid gap-4 lg:grid-cols-3"}>
        {SOURCES.map((s) => (
          <div key={s.name} className="rounded-xl border border-border p-3.5">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent">
                {s.name} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-sm font-semibold">{s.name}</span>
            )}
            <p className="mt-1 text-xs text-muted">{s.what}</p>
            {!compact && (
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs">
                {s.how.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-[11px] text-faint">{s.note}</p>
          </div>
        ))}
      </div>
      {!compact && (
        <p className="mt-3 text-xs text-muted">
          Any other CSV with a timestamp and open/high/low/close columns works too — the import wizard lets you map columns, the timestamp format and the source time zone. Tick files (bid/ask) are
          aggregated into M1 candles with the recorded average spread.
        </p>
      )}
    </Card>
  );
}
