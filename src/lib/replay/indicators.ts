// Indicators computed locally from the candles revealed so far. Inputs are
// arrays of the visible chart candles only; outputs are aligned arrays with
// NaN during the warm-up period.

export function sma(values: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values (standard convention). */
export function ema(values: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. First value at index `period`. */
export function rsi(closes: ArrayLike<number>, period = 14): Float64Array {
  const out = new Float64Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function trueRange(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>): Float64Array {
  const out = new Float64Array(high.length);
  for (let i = 0; i < high.length; i++) {
    const hl = high[i] - low[i];
    if (i === 0) {
      out[i] = hl;
      continue;
    }
    out[i] = Math.max(hl, Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  return out;
}

/** Wilder's ATR: first value is the simple mean of the first `period` TRs. */
export function atr(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, period = 14): Float64Array {
  const tr = trueRange(high, low, close);
  const out = new Float64Array(tr.length).fill(NaN);
  if (tr.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function macd(closes: ArrayLike<number>, fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = new Float64Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) if (Number.isFinite(f[i]) && Number.isFinite(s[i])) line[i] = f[i] - s[i];
  // Signal = EMA of the MACD line over its defined segment.
  const start = line.findIndex((v) => Number.isFinite(v));
  const sig = new Float64Array(closes.length).fill(NaN);
  if (start >= 0) {
    const seg = ema(line.subarray(start), signal);
    sig.set(seg, start);
  }
  const hist = new Float64Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) if (Number.isFinite(line[i]) && Number.isFinite(sig[i])) hist[i] = line[i] - sig[i];
  return { line, signal: sig, hist };
}

/** Bollinger Bands with population standard deviation. */
export function bollinger(closes: ArrayLike<number>, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = new Float64Array(closes.length).fill(NaN);
  const lower = new Float64Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}
