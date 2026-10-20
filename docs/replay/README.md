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
   periods) and the **history before the start**: none, 1 week … 5 years
   (default 1 year), so there's a chart to analyse before the first replay
   candle. A coverage preview shows how many weeks are already stored, how
   many will be downloaded, and the estimated candles and storage.
   - The last ~3 months of history use the session's own resolution (1-minute
     by default). Anything older loads as **hourly candles**: FXCM's hourly
     files, or hourly candles built on the server from an imported dataset.
     Hourly history shows on 1h and higher timeframes (lower ones say where
     it starts).
   - It's only for reading the chart and indicators. The replay never trades
     on history, so fills are unchanged.
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

A dark, rounded "terminal" layout in the style of prop-firm replay terminals,
with TradingView conventions throughout. It respects the app's light/dark
theme.

**Header.**

- **Left:** back, session name (click to rename), and the replay controls:
  back · **Play** · **Next** · one-minute step · speed (1×–20×) · ⋯ Restart.
  A thin bar shows session progress.
- **Right:** starting and current balance, win rate, total trades, realized
  and unrealized P&L.
- **Buttons:** **Stats**, hide balances (eye), session settings, and help /
  shortcuts.

**Chart card.**

- **Top bar:**
  - Symbol info, timeframes (1m … W), **Indicators**, **+ Place Order**,
    **Go to** (date), undo/redo for drawings.
  - The favourites toolbar sits in the middle.
  - Right side: Save (autosave status), chart settings (session shading,
    auto-scroll, time zone, theme), full screen, screenshot.
- **Left drawing rail:**
  - TradingView tool groups, each with a flyout: cursors, trend-line tools,
    Fibonacci, shapes, text, and prediction & measurement (long/short
    position, price range, date range).
  - Star a tool in its flyout to add it to the favourites toolbar.
  - Toggles and actions: zoom in, magnet (snap to OHLC), stay in drawing
    mode, lock all, hide all, remove (drawings and/or indicators), and the
    object tree.
- **Chart legend:** symbol, timeframe and OHLC. Under it, each indicator with
  its value plus hide, settings and remove buttons, and quick **SELL / BUY**
  buttons.
- **Bottom bar:**
  - Visible-range presets 5y … 1d and Go to.
  - The replay clock; click it to change the time zone.
  - `%`, `log` and `auto` price-scale modes.

**Position tool (long/short).**

- **Clean like TradingView:** when not selected, a position tool is just two
  light zones behind the candles. Its labels appear on hover or selection, and
  clicking elsewhere hides them. Unselected tools don't capture the mouse, so
  you can pan straight through them.
- Placing one shows a small, non-blocking **"Use this drawing?"** card:
  - **Leave as annotation** keeps it as a drawing.
  - **Use as order** fills the order panel from it: side, entry, stop and
    target, and the order type. Limit or stop is chosen from where the entry
    sits; it's a market order when the entry is at the current price.
- Labels follow TradingView:
  `Target: 0.00250 (0.23%) 25.0 pips, Amount: $250.00`, and a centre label
  `Open P&L: +$40.00, Qty: 0.50 lots / Risk/Reward Ratio: 2`.
- While it's selected, the price scale shows its target, entry and stop
  labels, and the time scale highlights its span.

**New order panel.**

- **Risk inputs:**
  - Risk base: initial or current balance.
  - Risk chips: 0.3–3%.
  - Risk % and risk amount, linked to each other.
  - Size in lots; editing it switches to fixed lots.
- **Order:** order type (market, limit, stop), Buy/Sell, entry price.
- **Stops:** stop loss and take profit, entered as price or pips. A
  crosshair button picks a price on the chart.
- **Summary:** risk, reward and R:R.

The order preview is drawn on the chart and can be dragged.

**Trade lines** on open positions and orders stay compact (`LONG 0.50
−$12.30`, `SL −$97.10`). Hover a line for pips, % and R:R, and for the
`+ SL` / `+ TP` handles.

**Clean chart:** when a trade hits its stop or target, or you close it, it
leaves nothing on the chart. **Past trades on chart** (chart settings) brings
back the zones and entry/exit markers of closed trades, and **Trade marker
labels** adds text such as `TP +2.0R`; both are off by default.

**Stable view:**

- **Stepping:** when the newest candle is on screen the chart follows it.
  When you've scrolled back to study history, stepping leaves the view
  alone; the » button returns to the replay point.
- **Step back, Go to and timeframe switches** keep your zoom.
- **The price axis** rescales only for live trades and pending orders, never
  for drawings or the order preview. A price axis you zoomed by hand stays
  zoomed (the **auto** button shows its state).

**Manage position:**

- Open it with **Manage** on an open position (Open tab or the panel's
  Journal tab), or by clicking the position's label on the chart.
- Close part of the trade: 25 / 50 / 75 / 100 % or an exact lot size. It
  shows what that realises and what remains.
- Set the stop (with a **Break-even** shortcut) and the target for the
  remaining lots. **Close all** closes everything.

**Trade on the chart:** click a closed trade in the Closed tab, the
panel's Journal tab, the Journal page or the analytics trade table to see it
as you took it.

- **What it shows:** the candles around the trade (never beyond what the
  session had revealed), the position box with stop and target zones, the
  path to the exit, entry and exit markers, your drawings, every exit and
  the full trade details.
- **Timeframes:** switch between M1 and H4.

**Trades panel:**

- **Pending / Open / Closed** tabs, plus Journal, Notes and Log.
- Drag the grip under the chart to resize it, or collapse it.

**Stats drawer:**

- Net P&L with an equity sparkline, win-rate gauge and profit-factor ring.
- Average win and average loss.
- Expectancy, total R, drawdown, open risk, largest win and loss, long vs
  short, average hold time and streaks.

**Other features:**

- **Drawings:** while a drawing tool is active, pressing on the chart draws
  instead of panning. Two-point tools (rectangle, trend line, Fibonacci,
  ranges) take click–click or press–drag–release. Select a drawing to move or
  reshape it; it moves by whole candles, so it keeps its shape across
  weekends. Drawings are anchored to candle time and price, so zooming and
  scrolling never move them. The floating style bar sets colour, width, style
  and text, and has lock, delete and duplicate.
- **Undo/redo:** `Ctrl/⌘+Z` and `Ctrl/⌘+Shift+Z`.
- **Right-click:** limit/stop orders at a price, position tools, a horizontal
  line, and actions on the drawing you clicked.

**Keys:**

- **Replay:** `Space` play/pause · `→` next candle · `Shift+→` one minute ·
  `←` previous candle · `+` / `−` playback speed (1× … 20×).
- **Tools and orders:** `Enter` uses the selected position drawing as an
  order · `Esc` cancels the tool / deselects · `Delete` removes the selected
  drawing.
- **Drawing tools:** `Alt+C/X/T/J/H/V/F/R/N/L/S/P/D`.
- **Help:** `?` lists every shortcut.

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
