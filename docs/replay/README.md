# Replay — historical forex backtesting

Replay is a module inside Moblog for replaying historical forex data candle by
candle, trading it with simulated orders, and measuring the results.

- **Storage:** candles, sessions, trades, journals and settings are stored in
  the app's PostgreSQL database (Prisma), not in the browser.
- **Data:** for 22 FX pairs, history is downloaded automatically from FXCM's
  free public candle archive. For any other instrument, import your own CSV.
- **Cost:** no paid data, no API keys, no extra service.

## Routes

| Route | What |
|---|---|
| `/replay` | Sessions dashboard: summary, search, filters, sort, grid/table, favourites, rename/duplicate/archive/delete, backup |
| `/replay/new` | Session wizard: Market → Period & timeframe → Trading settings → Review |
| `/replay/session/[id]` | Session detail: metrics, equity curve, recent trades, data and execution settings, actions |
| `/replay/session/[id]/chart` | Workstation: chart, drawing tools, order ticket, positions, history |
| `/replay/analytics` | Metrics, charts and breakdowns with filters and drill-down |
| `/replay/journal` | Trade journal across sessions |
| `/replay/datasets` | Stored data (downloaded and imported), CSV import, storage use |

## Setup

Replay adds six tables (`ReplayDataset`, `ReplayCandleDay`,
`ReplayProviderChunk`, `ReplaySession`, `ReplayJournalEntry`, `ReplayMeta`) in
the migration `prisma/migrations/20261018120000_add_replay`. The migration only
creates tables; it doesn't change any existing table. Apply it once:

```bash
npm run db:deploy        # = prisma migrate deploy, against DATABASE_URL
```

`npm run build` already runs `prisma migrate deploy`, so a deploy applies it
too. Until the tables exist, Replay's API answers 503 with that instruction
instead of failing silently.

## Quick start

1. `/replay` → **Create session**.
2. **Market:** pick a pair (e.g. EUR/USD). Pairs FXCM covers are marked
   *Auto-download*. Anything else needs an imported dataset.
3. **Period & timeframe:** pick a preset (30 days to 5 years) or custom
   dates, the chart timeframe (M1–D1), data resolution (M1, or H1 for long
   periods) and the history shown before the start. A coverage preview shows
   how many weeks are already stored, how many will be downloaded, and the
   estimated candles and storage.
4. **Trading settings:** balance, account currency, risk per trade, spread
   (fixed or recorded), commission, slippage, strategy and tags.
5. **Review → Start.** The preparation screen shows each stage:
   - checking stored history and provider availability
   - downloading missing weeks (live counts of weeks, candles, rejected rows,
     retries and the current week)
   - checking the period for gaps
   - preparing the timeframe
   - starting the replay

   Downloads resume where they stopped. Weeks already stored are reused by
   every session.

## The workstation

**Replay controls:** play/pause, step forward, step one minute inside the
candle, step back, speed (1×–20× chart candles per second), jump to a date.
Stepping back lists the trades it would undo and asks first.

**Trading:** market and pending orders, SL/TP, break-even, partial close.
Long/Short position tools show target and stop zones with price, %, pips,
money, % of the account, quantity and R:R; **Place order** (or `Enter`)
opens a pre-filled order. Trade pills on each position and order line update
live while you drag SL/TP. Drag a ghost `+ SL` / `+ TP` off the entry line to
add one. Right-click for limit/stop orders at a price.

**Drawing tools** (left toolbar, TradingView-like):

| Tool | Shortcut | Tool | Shortcut |
|---|---|---|---|
| Cursor (select, move) | `Alt+C` | Long / Short position | `Alt+L` / `Alt+S` |
| Crosshair (snaps to OHLC) | `Alt+X` | Fibonacci retracement | `Alt+F` |
| Trend line | `Alt+T` | Text note | `Alt+N` |
| Horizontal line | `Alt+H` | Price range (Δ, %, pips, bars) | `Alt+P` |
| Vertical line | `Alt+V` | Date range (bars, duration) | `Alt+D` |
| Horizontal ray | `Alt+J` | Rectangle / zone | `Alt+R` |

What you can do with drawings:

- **Edit:** select to move, or drag the end handles. The settings bar sets
  colour, width, style and text, and has lock, duplicate and delete. The
  right-click menu has lock, duplicate and delete too.
- **Undo/redo:** `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` (or `Ctrl+Y`).
- **Toolbar toggles:** stay in drawing mode, hide all drawings, shade the
  Asia/London/New York sessions, clear all.
- **Saving:** drawings are saved with the session in the database.

**Layout:** the right panel can be resized, and the bottom panel can be
collapsed (both remembered per browser). Floating chart buttons:
**Replay point** (jump back to the latest candle), auto-scroll, reset view.
Light and dark themes.

**Keys:**

- **Replay:** `Space` play/pause · `→` next candle · `Shift+→` one minute ·
  `←` previous candle.
- **Tools and orders:** `Enter` place the position tool's order · `Esc`
  cancel tool / deselect · `Delete` delete the selected drawing.
- **Help:** `?` shows every shortcut.

## Commands

```bash
npm install
npm run db:deploy          # apply Replay's migration to DATABASE_URL (once)
npm run dev                # builds the import worker, then next dev
npm run build              # existing script: Prisma steps (touch DATABASE_URL), then next build
npm run typecheck
npm run lint
npm test                   # Vitest: unit + database integration tests
npm run test:e2e           # Playwright on a production build (uses installed Chrome)
E2E_DEV=1 npm run test:e2e # same against next dev (stop your own dev server first)
node scripts/test-db.mjs start|stop   # the throwaway test database, by hand
npm run build:worker       # rebuild public/replay-import.worker.js after editing the worker
```

**Tests never touch `DATABASE_URL`.**

- `npm test` and `npm run test:e2e` start a throwaway PostgreSQL cluster in
  `.test-db/` (git-ignored) on port 54329, apply the migrations, and stop it
  afterwards.
- This needs local PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`), e.g.
  `brew install postgresql@14`, or set `PG_BIN`.
- Without them, `npm test` skips the database tests and runs the rest;
  `npm run test:e2e` can't start.
- The real-data end-to-end test downloads one week of EURUSD from FXCM, so it
  needs internet access.

## Data sources

| Source | How | Coverage |
|---|---|---|
| FXCM historical candles | **Automatic** (server downloads, validates, stores) | 22 FX pairs, M1 and H1, bid + ask in UTC, from 2012 to roughly 9 days ago |
| CSV / ZIP import | `/replay/datasets` → Import | Anything with timestamp + OHLC: HistData, Dukascopy exports, MetaTrader, generic CSV, ticks |

Automatic pairs: EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD,
EURJPY, GBPJPY, EURGBP, AUDCAD, AUDCHF, AUDJPY, AUDNZD, CADCHF, EURAUD,
EURCHF, GBPCHF, GBPNZD, NZDCAD, NZDCHF, NZDJPY. XAUUSD and other metals,
indices and pairs FXCM doesn't publish have to be imported.

Replay never makes up candles. A missing week is recorded as missing and
shown in the session's data check. See [RESEARCH.md](RESEARCH.md) for why
FXCM is the only automatic source, and its terms.

## CSV import guide

The wizard streams the file in a Web Worker (`.csv`, `.txt` or `.zip`), then
uploads the candles to the database in compressed parts.

- **Detected layouts:**
  - HistData: Generic ASCII M1 (`20240102 000000;o;h;l;c;v`), tick
    (`20240102 000003660,bid,ask,vol`), MetaTrader and MetaStock
  - NinjaTrader ticks
  - Dukascopy (`Gmt time,Open,…` with `DD.MM.YYYY HH:mm:ss.SSS`, or
    `Local time` with an embedded `GMT+0200`)
  - MetaTrader 5 (`<DATE> <TIME> … <SPREAD>`)
  - generic CSVs with headers such as
    `timestamp/date/time/open/high/low/close/volume/bid/ask`
- **Timestamps:** `YYYYMMDD HHMMSS[mmm]`, ISO (with `Z` or offsets),
  `DD.MM.YYYY …`, `MM/DD/YYYY …`, unix seconds or ms. Day/month ambiguity is
  flagged.
- **Source time zone,** converted to UTC on import: UTC, EST fixed UTC−5
  (HistData), broker GMT+2/+3 (US DST), New York, London, Central Europe,
  fixed UTC+2/+3, Tokyo.
- **Price basis:** bid, ask, mid or unknown (treated as mid and labelled).
- **Ticks** are aggregated to M1, and the average spread per minute is stored.
- **Quality report before anything is saved:** malformed rows, invalid OHLC,
  duplicates and conflicts, out-of-order rows, misaligned candles, gaps.
  Missing candles are never filled.
- **Append** to an existing dataset to extend it. Existing candles win on
  overlap. Each append bumps the dataset version so sessions can tell their
  data changed.

## Moving data from the old browser storage

Earlier builds kept Replay in IndexedDB. If that data is still in a browser,
the dashboard's Backup card shows **Move to database**. It reads the old data
once as a backup and imports it into PostgreSQL. It deletes the browser copy
only if you confirm. Backup files from either version can be restored.

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): modules, tables, API, data pipeline,
  determinism.
- [EXECUTION.md](EXECUTION.md): fills, costs, gaps, same-candle SL/TP, sizing.
- [ANALYTICS.md](ANALYTICS.md): every metric's definition.
- [LIMITATIONS.md](LIMITATIONS.md): known limitations.
- [RESEARCH.md](RESEARCH.md): data-source research and terms.

## Third-party licences

- **TradingView Lightweight Charts™ 5.2.1 (Apache-2.0).** The chart shows the
  TradingView logo link (`attributionLogo: true`). The workstation credits
  "Charts by TradingView Lightweight Charts™" with a link, as its NOTICE
  requires.
- **Development only:** esbuild (MIT), Vitest (MIT), Playwright (Apache-2.0).
