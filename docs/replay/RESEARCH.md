# Data-source research

Checked against the providers' own pages and servers in October 2026.
Providers change terms and formats, so re-check before relying on any of this.

The requirement was automatic history that is:

- free, with no paid API, no API key and no mandatory account
- fetched without circumventing rate limits, CAPTCHAs or authentication
- never fabricated

## FXCM historical candles (used: automatic, first choice)

- **Source:**
  - Documentation: [github.com/fxcm/MarketData](https://github.com/fxcm/MarketData)
  - Files:
    `https://candledata.fxcorporate.com/{m1|H1}/{SYMBOL}/{YEAR}/{WEEK}.csv.gz`
- **Format:** gzip CSV, one trading week per file (Sunday ~21:00 UTC → Friday
  ~22:00 UTC).
  - Header: `DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose`
  - Time zone: UTC
- **Week numbering** was verified against 15 real files from 2012 to 2026. A
  file is named after the year of the Sunday that opens the trading week, so
  Sunday 29 Dec 2019 is `2019/53`. Some week numbers don't exist (`2020/1`
  doesn't).
- **Coverage:**
  - 2012 onwards; 2011 and earlier return 404.
  - The newest files lag real time by about 1–2 weeks. Replay treats weeks
    newer than about 9 days as not yet published.
  - Resolutions: m1 and H1. (The README also lists D1, which Replay doesn't
    use.)
- **Instruments (22):** EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD,
  NZDUSD, EURJPY, GBPJPY, EURGBP, AUDCAD, AUDCHF, AUDJPY, AUDNZD, CADCHF,
  EURAUD, EURCHF, GBPCHF, GBPNZD, NZDCAD, NZDCHF, NZDJPY. There is no XAUUSD
  or other metals.
- **Prices:** indicative bid and ask. Replay stores the bid OHLC and a
  per-candle spread, the mean of the open and close bid/ask spreads. Rows with
  ask < bid keep the candle but mark its spread unknown. Invalid rows are
  rejected and counted.
- **Access:** public HTTPS, no key, no login. Replay downloads only the weeks
  it needs:
  - each week once (stored weeks are reused)
  - 2 at a time
  - honouring `Retry-After`
- **Terms:** FXCM publishes the data for personal use under its EULA. Replay
  stores it only in your own database and never redistributes it.
- **Holes (checked October 2026).** The archive is incomplete in ways that
  affect every pair, not one symbol:
  - weeks that return 404 — for EURUSD 2024-W35, W51, W52, W53, 2025-W02,
    W29, W30 and **all of 2026-W18 … W31** (May–August 2026)
  - 0-byte files served with HTTP 200 — AUDCAD 2024-W51/W52, and the hourly
    files AUDCAD 2024-W52 and 2025-W02
  - files with only the header — AUDCAD 2022-W46, and 2023-W27 for both
    EURUSD and AUDCAD
  - files cut off after a few hours — 2025-W26 holds only Friday afternoon
    (93–231 candles instead of ~7 180)

  Before the Exness fallback, a 0-byte file was treated as a server error,
  retried 5 times and then stopped the whole preparation; the other holes were
  stored as gaps. A complete FXCM week holds 7 135–7 183 M1 candles with no
  gap over 20 minutes (the daily rollover), so a week below 85 % of 7 200
  minutes, or with a gap over 3 hours, is treated as incomplete.

## Exness tick history (used: automatic, for the weeks FXCM lacks)

- **Source:**
  - Page: [exness.com/tick-history](https://www.exness.com/tick-history/)
  - Files:
    `https://ticks.ex2archive.com/ticks/{SYMBOL}/{YEAR}/{MM}/Exness_{SYMBOL}_{YEAR}_{MM}.zip`
- **Format:** one ZIP per symbol and calendar month holding one CSV of every
  quote: `"exness","EURUSD","2026-10-22 23:59:58.502Z",1.12208,1.12214`
  (bid, ask, UTC). Sorted, no malformed rows or ask < bid in the files checked.
- **Coverage:**
  - from January 2016 (2015 and earlier return 404)
  - the current month's file is rebuilt every day at about 01:40 UTC with
    everything up to the previous midnight
  - all of FXCM's 22 pairs (checked one by one), plus metals, indices and
    crypto that Replay doesn't use yet
- **Size:** 5–13 MB a month for an FX pair (48 MB of CSV for AUDCAD, Dec 2024);
  XAUUSD is about 30 MB. Far heavier than FXCM's ~100 KB weeks, which is why
  Exness is only the fallback.
- **Quality, compared with FXCM:** for EURUSD 2024-W50 the minute closes
  differ by 0.2 pip (median) and 0.5 pip (95th percentile), with no time
  shift (an hour's shift raises the median to ~4.7 pips). Exness had the
  complete AUDCAD 2024-W51 that FXCM serves as a 0-byte file (7 192 minutes).
  Its spreads are wider (median 0.6 pip vs FXCM's 0.25 on EURUSD).
- **Prices:** Replay builds bid OHLC candles from the ticks, with the spread
  of each candle's first and last tick (as FXCM's open/close spreads). Minutes
  without a tick have no candle, as with FXCM.
- **Access:** public HTTPS on a CDN, no key, no login; `robots.txt` allows
  everything. Each month file answered in about 1 s and downloaded in about
  6 s. Replay downloads a month only for weeks FXCM can't serve, and keeps
  the last three for 10 minutes so the other weeks of a month reuse them.
- **Terms:** Exness describes the data as indicative and for information.
  Replay stores it only in your own database and never redistributes it.

## Dukascopy (rejected for automatic use; manual export → import)

- The free web export tool is manual and may require a free account. Replay
  imports its CSVs.
- The binary "datafeed" URLs that third-party tools use are undocumented.
  Fetching them from the server got throttled (503/429) after a few requests.
- Re-tested in October 2026 as a possible fallback: one week of M1 needs 12
  files (bid and ask per day). They took 10–75 s each, several timed out, and
  the server answered 429 after about 35 requests. The data itself is good
  (AUDCAD 2024-W51 was there), but this rate can't fill a week inside the
  60 s request limit, and Exness covers the same weeks.
- Dukascopy's own documentation for bulk historical data points to a paid
  (S3 Requester Pays) route.
- Automating the datafeed would mean working around its throttling, so
  Replay doesn't call it.

## Stooq (rejected)

Its download endpoint now sits behind a JavaScript bot check, which Replay
must not circumvent.

## HistData.com (manual download → import)

- **Coverage:**
  - 66 instruments, including FX majors and crosses, XAU/USD, XAG/USD, oil
    and some indices
  - EUR/USD from May 2000
  - M1 bars and ticks
- **Prices and time zone:** bid prices, in EST without daylight saving
  (fixed UTC−5).
- **Access:** free downloads per pair and year through a web form. There is no
  public API; FTP and auto-updates are paid. Replay therefore doesn't automate
  it.
- **Use in Replay:** it's the recommended source for XAUUSD and for history
  before 2012. Replay imports the `.zip` directly and detects the format, the
  UTC−5 time zone and the bid basis.
- **Licence:** "free", with no warranty and no redistribution grant. Treat it
  as personal use.

## Other options considered

- **MetaTrader 4/5 history from a demo account:** free and supported as a CSV
  import. Prices and time zone are broker-specific.
- **TrueFX, Alpha Vantage FX, Twelve Data, Polygon and similar:** need an
  account or API key, or have quotas or paid tiers. Not used, so the core
  never depends on a key.

## TradingView Lightweight Charts

- **Version and licence:** 5.2.1, Apache-2.0.
- **Attribution:** required. The `attributionLogo` option is kept on, and the
  workstation credits TradingView with a link.

## Limitations that can't be eliminated

- M1 data can't reproduce the tick path inside a minute (see EXECUTION.md).
- FXCM and Exness prices are indicative, not a record of fills at your broker.
- Free sources are not audited. Gaps and occasional bad ticks exist; Replay
  reports them but doesn't repair them.
