# Execution model

Implemented in `src/lib/replay/engine.ts`; every rule below has a unit test in
`src/lib/replay/__tests__/engine.test.ts`.

## Prices

- Orders are evaluated one **base candle** at a time (usually M1), whatever the
  chart timeframe.
- Stored OHLC has a basis. **Bid** data: ask = bid + spread. **Ask** data:
  bid = ask − spread. **Mid** or unknown: ± half the spread.
- Spread: a fixed number of pips, or **recorded**, falling back to the fixed
  value where none was recorded. Recorded spreads come from three sources:
  - FXCM downloads: the mean of each candle's open and close bid/ask spread
  - imported ticks: the per-minute average
  - a MetaTrader SPREAD column
- Buy entries fill on the ask and sell entries on the bid. Longs exit on the
  bid, shorts on the ask.

## Orders

| Type | Supported | Fill rule |
|---|---|---|
| Market buy/sell | ✓ | Close of the last revealed candle (the current price) ± spread, plus adverse slippage |
| Buy limit / sell limit | ✓ | When the ask (buy) falls to, or the bid (sell) rises to, the price. A gap through it fills at the better open |
| Buy stop / sell stop | ✓ | When the ask (buy) rises to, or the bid (sell) falls to, the price, plus slippage. A gap fills at the open plus slippage |
| Stop-loss / take-profit | ✓ | Attached to positions or pending orders; editable, draggable on the chart |
| Break-even | ✓ | Moves the stop to the entry fill price |
| Partial close | ✓ | Any size in 0.01-lot steps; "½" button |
| Modify / cancel pending | ✓ | Price, SL, TP |
| Order expiry, trailing stops, OCO | — | Not implemented |

Validation: a long's SL must be below and its TP above the current bid (or the
order price for pending orders), mirrored for shorts. Limit and stop prices
must be on the correct side of the market. Size must be 0.01–100 lots.

## No look-ahead

- A command is stamped with the replay time it was issued at. It only
  interacts with candles **after** that one. A pending order can never fill on
  the candle that was visible when it was placed.
- Market orders use the last revealed close, never the next open.

## Gaps and same-candle ambiguity

- If a candle **opens beyond the stop**, the stop fills at the open (minus
  slippage), not at the stop price. A take-profit gapped through fills at the
  open, which is better.
- Slippage is clamped to the candle's range: no fill at a price the candle
  never traded.
- If **SL and TP are both inside one candle**, the order of events is unknown.
  The **stop is assumed to fill first**, never the favourable outcome. The exit
  is flagged `ambiguous` and marked `*` in the history and analytics.
- On the candle a pending order fills, the stop is checked against the whole
  candle (worst case) and the target only from the next candle. For limit
  entries the same-candle stop is certain; for stop entries it is flagged
  ambiguous.

## Costs and money

- **Commission:** per lot, round turn, in account currency. Half is charged at
  entry (shown in equity) and half at exit; partial closes take their share.
- **P&L:** price distance × lots × contract size × conversion. Contract sizes
  are 100,000 for FX, 100 oz for XAUUSD and 5,000 oz for XAGUSD.
- **Conversion** of quote currency to the account currency:
  - quote = account (EURUSD on USD): exact
  - base = account (USDJPY on USD): ÷ the exit price, exact
  - otherwise (EURJPY or EURGBP on USD): a **fixed, user-entered rate**. The
    session can't trade until you enter it, and its money values are marked
    approximate.
- **Balance** changes only when trades (or parts) close. **Equity** = balance
  + unrealised P&L at the current bid/ask − entry commission still open.
- **Max DD** in the workstation is marked to market at every candle close.
  Analytics drawdown uses the realised (closed-trade) curve.

## Position sizing

`lots = risk money ÷ loss per 1.00 lot at the stop`, where loss per lot uses
the expected fill (including spread and slippage) and the instrument's own
contract size and conversion at the stop price. Lots are rounded **down** to
0.01 so the realised risk never exceeds the target. If even 0.01 lots would
risk too much, the order is refused with an explanation. Modes: % of equity,
fixed money, fixed lots.

## Intrabar limitation

With M1 data, the path inside each minute is unknown. Replay can't reproduce
the original tick sequence, even for data imported from ticks, because ticks
are aggregated to M1 on import. The conservative rules above bound the error
against the trader, not in their favour.
