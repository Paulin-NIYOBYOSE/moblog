const moneyFmt = new Map<string, Intl.NumberFormat>();

export function money(value: number | null | undefined, currency = "USD", opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const key = `${currency}|${opts.compact ? "c" : "s"}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    });
    moneyFmt.set(key, f);
  }
  const s = f.format(Math.abs(value));
  if (!opts.signed) return value < 0 ? `−${s}` : s;
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

export function fmtR(r: number | null | undefined, digits = 2): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return "—";
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(digits)}R`;
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = signed && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function tone(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 1e-9) return "text-muted";
  return v > 0 ? "text-profit" : "text-loss";
}

export function parsePrice(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parsePositive(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
