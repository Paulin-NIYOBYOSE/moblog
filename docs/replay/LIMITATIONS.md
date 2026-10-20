# Known limitations

## Data

- **Automatic downloads cover only FXCM's 22 FX pairs,** from 2012 to roughly 9
  days ago, at M1 or H1. XAUUSD, other metals, indices, other pairs and older
  history need a CSV import (e.g. HistData).
- **FXCM depends on a third party.** If its archive changes or goes away,
  automatic downloads stop. Data already stored keeps working.
- **The browser drives downloads.** They run while the preparation screen is
  open. Closing it stops after the current week, and reopening resumes from
  the stored weeks. There is no background job queue.
- **Downloads go through the server.** On serverless hosting each week has to
  finish inside the function limit (`maxDuration` 60 s). An M1 week file is
  about 100 KB compressed, so this is normally fine.
- **Long history is hourly.** History more than ~3 months before the start
  is loaded as hourly candles, so it shows only on 1h and higher timeframes.
  Lower timeframes start about 3 months before the replay.
- **Bid-only imports** (HistData, MetaTrader) model the ask with your spread.
  FXCM and tick imports have recorded spreads.
- **Database size:** one year of M1 for one pair is about 2.4 MB in
  `ReplayCandleDay` (measured on real EURUSD). The wizard's estimate uses
  10 bytes per candle, so it errs high. On a free-tier hosted database,
  check your storage quota; the dashboard shows Replay's usage.

## Simulation

- **Intrabar path:** the order of prices inside a candle can't be known.
  Same-candle SL/TP resolves to the stop and is flagged.
- **Crosses on a different account currency** (EURJPY on USD…) use one fixed
  conversion rate for the session, marked approximate.
- **No margin, leverage or swap/rollover** modelling. Equity can go negative.
- **Not implemented:** order expiry, trailing stops, OCO brackets and alerts.
- **Time zones:** wall-clock times in a DST gap or overlap hour resolve to the
  first matching offset.

## Product

- **Login:** Replay pages and APIs are behind the app's existing login, with a
  single user. There are no per-user rows; everyone who can log in sees the
  same sessions.
- **Drawings** are anchored to candle times. A trend line drawn on one
  timeframe is approximate on another. Fibonacci shows the standard levels
  only, with no custom levels.
- **Indicators** are SMA, EMA, Bollinger, RSI, ATR and MACD. There is no
  scripting.
- **Stepping back** can't undo actions taken on the session's first candle.
  Use Restart (it offers to keep a copy).
- **Two tabs saving one session:** the second save gets a conflict notice
  instead of silently overwriting.
- **No offline mode.** Data is on the server.

## Tooling

- **Import worker:** Turbopack copies `new Worker(new URL(…))` targets
  unbundled, so the import worker is bundled with esbuild
  (`npm run build:worker`, run before `dev` and `build`). If it can't load,
  the import runs on the main thread.
- **`npm run build` touches the database:** it runs Prisma migrations against
  `DATABASE_URL`. To compile without that, run
  `npm run build:worker && npx next build`.
- **Database tests need local PostgreSQL** binaries (see README). Without
  them, those tests are skipped.
- **The real-data end-to-end test needs internet access** to reach FXCM.
