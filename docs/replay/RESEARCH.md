# Data-source research

Checked against the providers' own pages and servers in October 2026.
Providers change terms and formats, so re-check before relying on any of this.

The requirement was automatic history that is:

- free, with no paid API, no API key and no mandatory account
- fetched without circumventing rate limits, CAPTCHAs or authentication
- never fabricated

## FXCM historical candles (used: automatic)

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

## Dukascopy (rejected for automatic use; manual export → import)

- The free web export tool is manual and may require a free account. Replay
  imports its CSVs.
- The binary "datafeed" URLs that third-party tools use are undocumented.
  Fetching them from the server got throttled (503/429) after a few requests.
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
- FXCM prices are indicative, not a record of fills at your broker.
- Free sources are not audited. Gaps and occasional bad ticks exist; Replay
  reports them but doesn't repair them.
