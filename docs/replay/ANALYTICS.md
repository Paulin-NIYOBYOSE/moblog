# Analytics definitions

Computed in `src/lib/replay/analytics.ts` from **closed trades only**, after
the page filters. Open positions are excluded (the page says how many). The
same definitions appear as tooltips in the app.

| Metric | Definition |
|---|---|
| Net P&L | Σ net P&L of closed trades (after spread, slippage, commission) |
| Return | Net P&L ÷ starting balance |
| Win / loss / breakeven | Net P&L > 0 / < 0 / = 0 (to the cent). An optional "breakeven band" treats \|R\| ≤ x as breakeven |
| Win rate, loss rate | Wins ÷ total, losses ÷ total (breakevens stay in the total) |
| Gross profit / loss | Σ net of winners / \|Σ net of losers\| |
| Profit factor | Gross profit ÷ gross loss. With no losses it shows "No losses" instead of ∞ |
| Average win / loss | Gross profit ÷ wins, −gross loss ÷ losses |
| R-multiple | Net P&L ÷ **initial risk**, the money lost at the stop that existed when the position opened, for the full original size. Moving the stop later never changes it. No initial stop → R unavailable (excluded from R statistics, still counted as a trade) |
| Average R, median R | Mean and median of valid R-multiples |
| Expectancy (R) | Σ valid R ÷ number of valid trades |
| Expectancy (money) | Net P&L ÷ total trades |
| Max drawdown | Largest fall from the running peak of the realised equity curve: the starting balance, then one point per exit (partial closes included) in chronological exit order. % is relative to that peak. Peak, trough and recovery times are shown |
| Consecutive wins/losses | Longest runs in exit order; a breakeven ends both |
| Largest win / loss | Best and worst single trade by net P&L |
| Holding time | Final exit time − entry time, in replay (market) time |
| Long vs short | The same figures per direction |

## Dashboard

The top of the page follows FX Replay / trading-journal dashboards:

- **KPI strip:**
  - Net P&L and trade count.
  - Trade expectancy, per trade in money and in R.
  - Profit factor, with a ring showing gross profit vs gross loss.
  - Win %, with a gauge splitting wins, breakevens and losses.
  - Avg win / loss trade, as a ratio bar.
- **Daily net cumulative P&L:** running total by exit day (UTC), shaded green
  above zero and red below.
- **Net daily P&L:** one bar per exit day.
- **P&L calendar:** month view with each day's net P&L and trade count, plus
  weekly totals. Arrows step through the months that have trades.

Clicking a bar, the cumulative curve or a calendar day lists that day's trades
in the table below.

## Charts

Equity curve with drawdown below it · cumulative R · R distribution (0.5R
bins) · monthly net P&L heatmap (exit month, UTC) · rolling win rate (10- or
20-trade window) · long vs short · breakdown tables by market session, weekday,
instrument, timeframe, strategy, setup, tag and holding time. Each chart
explains what's missing when there isn't enough data.

- **Market session:** London and New York are 08:00–17:00 local time, DST-aware.
  When both are open it counts as "London/NY overlap"; otherwise "Asia".
- **Weekday:** the trading day with the 17:00 New York roll, so Sunday-evening
  trades count as Monday.
- **Strategy and setup:** from the trade's journal entry, falling back to the
  session's strategy.

## Combining sessions

Analytics default to one session. Selecting several shows a banner with the
balance to measure against:

- **One account** (default): every selected session's trades run on a single
  account, in the order they closed. This shows how the strategy behaves
  traded as one account. Its starting balance defaults to the first selected
  session's and can be typed. Each trade's money P&L is as recorded in its
  session, which sized it on that session's balance.
- **Each session's own (summed):** returns and drawdown use the sum of the
  sessions' starting balances.

Either way trades are ordered by historical exit time and R metrics stay
comparable. If account currencies differ, the banner says money totals aren't
meaningful.

## Filters

Exit date (inclusive, UTC days), instrument, strategy, setup, timeframe,
direction, tags (match any). Every metric, chart and table recomputes from the
filtered set.

## Drill-down and sample sizes

- **Drill-down:** click an R-distribution bar, a monthly heatmap cell or a
  breakdown row to list exactly those trades in the trade table. **Clear**
  returns to the full filtered set.
- **Small samples:** breakdown rows with fewer than 30 trades are marked `*`.
  When the whole filtered set has fewer than 30 closed trades, a banner warns
  that win rate, expectancy and profit factor swing widely.
