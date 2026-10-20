# Architecture

Replay is a feature inside the existing Next.js 16 / React 19 app. Replay's
data lives in the app's PostgreSQL database, in six new Prisma models. The
browser keeps only small per-viewer preferences in `localStorage`: panel sizes,
sort order and the "stay in drawing mode" toggle.

```
src/lib/replay/                     domain logic (framework-free, unit-tested)
  types.ts                          data model (Bars, DatasetMeta, ReplaySession, Command, TradeRecord…)
  instruments.ts, time.ts           contract specs and conversion; time zones, DST, sessions
  bars.ts, aggregate.ts             columnar candles, merge, aggregation (never reads past the cursor)
  pack.ts                           RPK1 binary candle format (shared by client and server)
  csv.ts, unzip.ts, importer.ts     CSV/ZIP import: detection, streaming parser, quality report
  import.worker.ts, importClient.ts import Web Worker (bundled to public/replay-import.worker.js)
  providers/fxcm.ts                 FXCM week numbering, URLs, CSV parser and validation
  marketData.ts                     download planner and pipeline (resume, retry, fallback)
  dataClient.ts                     prepareData(): runs the pipeline with progress and cancel
  engine.ts, sizing.ts              deterministic execution engine; position sizing
  analytics.ts, indicators.ts       metrics and breakdowns; SMA, EMA, RSI, ATR, MACD, Bollinger
  session.ts, controller.ts         session lifecycle; one open session (candles, engine, autosave)
  storage/repo.ts                   API client used by the UI
  storage/legacy.ts, storage/db.ts  read-only reader of the old IndexedDB data (one-time migration)
  server/store.ts                   Prisma store: datasets, candles, sessions, journal, backup
  server/fxcmIngest.ts              server-side FXCM download → parse → validate → store
  server/http.ts                    auth check and error mapping for the API routes
src/app/api/replay/                 API routes (below)
src/components/replay/              UI: dashboard, wizard, preparation, workstation, chart, analytics, journal
src/app/(dashboard)/replay/         pages
```

## Database tables

| Model | Key | Content |
|---|---|---|
| `ReplayDataset` | `id` | symbol, timeframe, source, kind (`provider` / `import`), price basis, metadata (time zone, quality report, files), version |
| `ReplayCandleDay` | `(datasetId, day)` | one UTC day of candles as a deflated RPK1 pack, with status (`ok` / `empty`), count, first/last time, revision |
| `ReplayProviderChunk` | `(datasetId, chunk)` | one provider file (FXCM week `2024-W10`): `ok` / `empty` / `missing`, candle count, rejected rows, fetch time |
| `ReplaySession` | `id` | name, symbol, timeframe, status, favourite, archived, strategy, tags, revision, and the session document as JSON text |
| `ReplayJournalEntry` | `(sessionId, tradeId)` | one trade's journal entry (cascade-deleted with the session) |
| `ReplayMeta` | `key` | strategy templates, per-instrument preferences, app preferences |

Notes on the storage format:

- **RPK1 packs:** prices are int32 points at a per-pack scale, times are int32
  offsets, volume is float32, and an optional int32 spread is included.
  - Real EURUSD M1 takes about 6.4 bytes per candle (measured on 2024
    week 10), roughly 2.4 MB per pair-year.
  - Packs are served with `Content-Encoding: gzip`, so the browser receives
    them compressed.
- **Session JSON is stored as `TEXT`, not `JSONB`.** JSONB rounds some float
  digits, which would break the exact ledger check described under
  determinism below.
- **Saves use optimistic concurrency.** Every save sends the revision it was
  based on. A stale save gets 409; the workstation then stops autosaving and
  shows a notice asking you to reload. Saves from one tab are serialised.
- **Journal entries are their own rows.** Editing a journal on the Journal
  page doesn't overwrite a session open in another tab.

## API (`/api/replay/…`, behind the app's login)

| Route | Methods |
|---|---|
| `datasets` | GET list · POST create an import dataset |
| `datasets/[id]` | GET · PATCH (rename, record an imported file, merge quality) · DELETE |
| `datasets/[id]/candles` | GET `?from&to` (≤ 40 days per request, gzip) · PUT an uploaded pack (validated) |
| `data/fxcm` | GET probe a week · POST download and store a week |
| `data/validate` | POST gap check of a range |
| `sessions` | GET (`view=summary\|analytics\|full`) · POST |
| `sessions/[id]` | GET · PUT `{session, baseRevision}` · PATCH (name, favourite, archive, tags…) · DELETE |
| `sessions/[id]/journal` | PUT one entry · POST prune entries for undone trades |
| `meta/[key]` | GET / PUT `strategies`, `instrumentPrefs`, `preferences` |
| `backup` | GET export · POST restore (v2, and v1 files from the IndexedDB era) |
| `status` | storage used per table |

## Data pipeline (automatic download)

The browser drives the download one FXCM week at a time, so progress is real
and a closed tab loses at most the week in flight.

1. **Plan** (`planRequest`). The requested range plus the history before it is
   split into FXCM weeks. Each week is then sorted into one of these groups:
   - **already stored:** reused by every session
   - **known missing:** re-checked only while it is recent
   - **not published yet:** newer than the provider's lag
   - **to download:** everything else
2. **Download** (`ensureProviderData`, 2 weeks at a time). For each week the
   browser calls `POST /api/replay/data/fxcm`. The server then:
   - recomputes the week from its year and number and rejects anything that
     doesn't match
   - downloads the `.csv.gz` (30 s timeout, 12 MB cap) and gunzips it
   - parses it strictly and validates it, counting rejected rows
   - stores the week's candle-days and its chunk record in one transaction

   When FXCM returns an error:
   - **404/403:** the week is recorded as `missing`
   - **429/5xx:** the server returns 503 with `Retry-After`. The client waits
     for that delay (or backs off) and retries up to 5 times, then stops with
     a message. It never hammers the provider.
3. **Check** (`data/validate`). Gaps in the session's range are counted, with
   weekend closures told apart from missing intervals. The result is saved on
   the session (`dataCheck`) and shown on its detail page.
4. **Load.** The workstation loads base candles from ~3 months before the
   start to the session end, in 31-day windows, 4 requests in parallel.

**Long history** (`lib/replay/history.ts`):

- **Planning:** history further back than ~3 months is planned as hourly
  "context".
  - Automatic sessions download FXCM's hourly files for it (dataset
    `fxcm_SYMBOL_H1`, 4 files at a time).
  - Imported datasets get it from `GET …/candles?tf=H1`, which aggregates on
    the server, up to a year per request.
- **The seam:** base data starts on a weekly boundary, so no 1h–1W candle
  mixes the two sources. A test checks that the combined candles equal
  candles built from 1-minute data alone.
- **Chart only:** context is never given to the engine.

Nothing is ever synthesised to cover a gap. Imported datasets go through the
CSV pipeline instead: parse in a worker, show the quality report, then upload
packs of up to 45k candles. The server validates each pack before merging it
(existing candles win).

## Determinism and reproducibility

A session stores **commands** (market/pending/cancel/modify/close), each
stamped with the replay time at which it was issued. Engine state is a pure
function of `(candles, settings, commands, cursor)`.

- **On load,** state is rebuilt from the commands and compared with the cached
  ledger. A mismatch (the data or the engine changed) is shown as a warning.
- **Stepping back** truncates the commands after the target and rebuilds. The
  UI lists what will be undone and asks first. Journal entries for undone
  trades are pruned.
- **Changing execution settings** replays the same commands, after an explicit
  confirmation.
- **Data versions:** sessions record the dataset version they were built on,
  and data changes are flagged.
- **Duplicate command ids are rejected,** so a double submit can't open two
  trades.

## Replay model

- **Cursor:** the cursor is the last revealed base candle (M1, or H1 for H1
  datasets). `cursorT` is that candle's close time.
- **Chart candles** are aggregated from revealed base candles only. The last
  one is drawn as *forming* if its period hasn't elapsed.
- **Steps:** next candle reveals through the end of the next chart candle.
  `Shift+→` reveals one base candle. `←` goes back to the previous complete
  chart candle.
- **Playback** runs the same step function on a timer. It can pause on fills
  and exits.
- **No look-ahead in the display:** indicators, markers and tooltips read only
  revealed candles, and the area right of the replay edge is shaded.

## Performance

Measured by the `@perf` end-to-end test (production build, local test
database, Apple Silicon) on one year of synthetic M1 (377,280 candles). The
ranges below cover every run on 18–19 October 2026; timings vary between
runs on the same machine:

| Step | Time |
|---|---|
| Parse + quality report + upload to the database | 3.4–7.4 s |
| Wizard → chart ready (3 months history → year end) | 1.5–2.7 s |
| 40 consecutive M15 steps | 0.44–1.55 s |

Forward steps update the chart incrementally (`series.update`). Full redraws
happen only on rewind or a timeframe change. Long trade tables are windowed.
