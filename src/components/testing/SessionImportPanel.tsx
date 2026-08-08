"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Session, BacktestTradeInput } from "@/lib/testing/types";
import { buildCsvTemplate, downloadCsv, parseTradesCsv, type CsvParseError } from "@/lib/testing/csv";
import type { ImportSummary } from "@/lib/useTestingData";
import { formatSignedCurrency } from "@/lib/utils";

export default function SessionImportPanel({
  open,
  session,
  onClose,
  onImport,
}: {
  open: boolean;
  session: Session | null;
  onClose: () => void;
  onImport: (
    sessionId: string,
    rows: Omit<BacktestTradeInput, "sessionId">[],
  ) => Promise<ImportSummary>;
}) {
  const [rows, setRows] = useState<Omit<BacktestTradeInput, "sessionId">[]>([]);
  const [parseErrors, setParseErrors] = useState<CsvParseError[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setParseErrors([]);
    setFileName("");
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    const parsed = parseTradesCsv(text);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
  }

  async function handleImport() {
    if (!session || rows.length === 0) return;
    setImporting(true);
    try {
      const summary = await onImport(session.id, rows);
      setResult(summary);
      if (summary.errors.length === 0) {
        setRows([]);
      }
    } catch {
      // toast already shown by the hook
    } finally {
      setImporting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && session && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="relative z-10 flex h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Upload trades</h2>
                <p className="text-xs text-muted">{session.name}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98]"
                >
                  <Upload className="h-4 w-4" /> Choose CSV file
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => downloadCsv("moblog-testing-trades-template.csv", buildCsvTemplate())}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV template
                </button>
                {fileName && <span className="text-xs text-muted">{fileName}</span>}
              </div>

              <p className="mt-2 text-xs text-muted">
                Required columns: <code className="text-foreground">openDate</code>,{" "}
                <code className="text-foreground">pair</code>,{" "}
                <code className="text-foreground">pnl</code>. Everything else is optional — tags
                can be separated with <code className="text-foreground">;</code>.
              </p>

              {parseErrors.length > 0 && (
                <div className="mt-4 rounded-lg border border-loss/30 bg-loss-soft px-3 py-2 text-xs text-loss">
                  <div className="mb-1 flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> {parseErrors.length} row(s) could not be
                    parsed
                  </div>
                  <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                    {parseErrors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted">
                    {rows.length} trade{rows.length === 1 ? "" : "s"} ready to import
                  </p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="sticky top-0 bg-surface-2">
                        <tr className="text-left text-muted">
                          <th className="px-2.5 py-1.5 font-medium">Open</th>
                          <th className="px-2.5 py-1.5 font-medium">Pair</th>
                          <th className="px-2.5 py-1.5 font-medium">Side</th>
                          <th className="px-2.5 py-1.5 text-right font-medium">P&L</th>
                          <th className="px-2.5 py-1.5 font-medium">Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="whitespace-nowrap px-2.5 py-1.5">{r.openDate.slice(0, 10)}</td>
                            <td className="px-2.5 py-1.5 font-medium">{r.pair}</td>
                            <td className="px-2.5 py-1.5">{r.direction}</td>
                            <td
                              className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium tabular-nums"
                              style={{ color: r.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}
                            >
                              {formatSignedCurrency(r.pnl)}
                            </td>
                            <td className="px-2.5 py-1.5 text-muted">
                              {r.tags?.join(", ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 50 && (
                      <p className="px-2.5 py-1.5 text-muted">…and {rows.length - 50} more</p>
                    )}
                  </div>
                </div>
              )}

              {result && (
                <div className="mt-4 rounded-lg bg-profit-soft px-3 py-2 text-sm text-profit">
                  Imported {result.created} trade{result.created === 1 ? "" : "s"}
                  {result.errors.length > 0 && ` — ${result.errors.length} row(s) failed`}.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={rows.length === 0 || importing}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {rows.length > 0 ? rows.length : ""} trade{rows.length === 1 ? "" : "s"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
