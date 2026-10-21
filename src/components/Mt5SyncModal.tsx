"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, PlugZap, Unplug, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { buildExpertAdvisor } from "@/lib/mt5/expertAdvisor";
import { useData } from "@/lib/useData";
import type { Account } from "@/lib/types";
import { useConfirm } from "./ConfirmContext";

interface SyncStatus {
  connected: boolean;
  login: string | null;
  server: string | null;
  syncedAt: string | null;
  trades: number;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

async function fetchStatus(accountId: string): Promise<SyncStatus> {
  return readJson(await fetch(`/api/accounts/${accountId}/mt5`, { cache: "no-store" }));
}

/** Connects an account to MT5 through the MoblogSync expert advisor. */
export default function Mt5SyncModal({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account: Account | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && account && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
          >
            {/* Mounted per opening, so every visit starts from fresh state. */}
            <Mt5SyncPanel account={account} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Mt5SyncPanel({ account, onClose }: { account: Account; onClose: () => void }) {
  const { refreshAccounts, refreshTrades } = useData();
  const confirm = useConfirm();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  // The key exists only in this dialog, right after it was generated.
  const [key, setKey] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lastSync = useRef<string | null | undefined>(undefined);

  const accountId = account.id;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // WebRequest in MT5 only reaches public http(s) addresses on ports 80/443.
  const reachable = /^https:\/\/[^/:]+$/.test(origin) && !/\/\/(localhost|127\.|10\.|192\.168\.)/.test(origin);

  useEffect(() => {
    fetchStatus(accountId)
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  }, [accountId]);

  // While connected, watch for syncs so the first import shows up live.
  const connected = status?.connected ?? false;
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => {
      fetchStatus(accountId)
        .then(setStatus)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [connected, accountId]);

  // A sync landed while the dialog was open: pull the new trades in.
  const syncedAt = status?.syncedAt;
  useEffect(() => {
    if (syncedAt === undefined) return;
    if (lastSync.current !== undefined && syncedAt && syncedAt !== lastSync.current) {
      refreshTrades();
      refreshAccounts();
    }
    lastSync.current = syncedAt;
  }, [syncedAt, refreshTrades, refreshAccounts]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function download(k: string) {
    const source = buildExpertAdvisor({ url: origin, key: k, from });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
    a.download = "MoblogSync.mq5";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function generate() {
    if (status?.connected) {
      const ok = await confirm({
        title: "New connection key",
        message: "The MoblogSync EA you installed before will stop syncing until you replace it with the new file.",
        confirmText: "Continue",
        cancelText: "Cancel",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = await readJson(await fetch(`/api/accounts/${accountId}/mt5`, { method: "POST" }));
      setKey(body.key);
      setStatus(body.status);
      download(body.key);
      refreshAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create a connection key");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect MT5",
      message: "New MT5 trades will stop syncing into this account. Trades already imported stay in your journal.",
      confirmText: "Disconnect",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await readJson(await fetch(`/api/accounts/${accountId}/mt5`, { method: "DELETE" })));
      setKey(null);
      refreshAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  async function copyOrigin() {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the address is shown for manual copying
    }
  }

  const step = (n: number, title: string, body: React.ReactNode) => (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{body}</div>
      </div>
    </li>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <PlugZap className="h-4 w-4 text-accent" /> MT5 auto-sync
          </h2>
          <p className="text-xs text-muted">{account.name}</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {!status && !error && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {status?.connected && (
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            {status.syncedAt ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2 w-2 rounded-full bg-profit" /> Syncing
                  {status.login && (
                    <span className="font-normal text-muted">
                      · MT5 {status.login}
                      {status.server ? ` · ${status.server}` : ""}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Last sync {timeAgo(status.syncedAt)} · {status.trades} trade{status.trades === 1 ? "" : "s"} imported
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the first sync from MT5…
              </p>
            )}
          </div>
        )}

        {status && !status.connected && !key && (
          <p className="text-sm leading-relaxed text-muted">
            Trades flow into your journal automatically, so you don&apos;t have to type them in. A small free add-on (an
            Expert Advisor) runs inside your MetaTrader 5 and sends this account&apos;s trades here. It is read-only: it
            can&apos;t place or close trades, and your MT5 password never leaves MT5.
          </p>
        )}

        {status && !key && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Import trades from (optional)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            <span className="mt-1 block text-xs text-faint">
              Leave empty to import your whole history. If you already logged some of these trades by hand, pick the day
              after the last one to avoid duplicates.
            </span>
          </label>
        )}

        {status && !reachable && (!status.connected || key) && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
            MT5 can only send to a public https address, and this page is open at {origin}. Open Moblog on its live site
            (e.g. your Vercel URL) and download the connector from there.
          </p>
        )}

        {key && (
          <ol className="space-y-3">
            {step(
              1,
              "Put the file in MT5",
              <>
                MoblogSync.mq5 just downloaded. In MetaTrader 5 go to <b>File → Open Data Folder</b>, open{" "}
                <b>MQL5 → Experts</b> and move the file there.{" "}
                <button type="button" onClick={() => download(key)} className="font-medium text-accent hover:underline">
                  Download again
                </button>
              </>,
            )}
            {step(
              2,
              "Compile it",
              <>
                Press <b>F4</b> to open MetaEditor, open <b>MoblogSync</b> from the Experts folder and press{" "}
                <b>Compile</b> (F7).
              </>,
            )}
            {step(
              3,
              "Allow Moblog",
              <>
                <b>Tools → Options → Expert Advisors</b>: tick <b>Allow WebRequest for listed URL</b> and add
                <span className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 truncate rounded-md bg-surface-3 px-2 py-1 text-foreground">{origin}</code>
                  <button type="button" onClick={copyOrigin} className="btn btn-secondary btn-sm shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </span>
              </>,
            )}
            {step(
              4,
              "Attach it to a chart",
              <>
                Drag <b>MoblogSync</b> from <b>Navigator → Expert Advisors</b> onto any chart and click OK. Your history
                appears here within a minute. Keep MT5 running (on your computer or a VPS) for new trades to sync; when
                it starts again it catches up on anything it missed.
              </>,
            )}
          </ol>
        )}

        {error && <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
      </div>

      {status && (
        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          {status.connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-loss/30 px-3 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss-soft disabled:opacity-60"
            >
              <Unplug className="h-4 w-4" /> Disconnect
            </button>
          )}
          {!key && (
            <button type="button" onClick={generate} disabled={busy} className="btn btn-primary ml-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {status.connected ? "New connector file" : "Download MT5 connector"}
            </button>
          )}
          {key && (
            <button type="button" onClick={onClose} className="btn btn-secondary ml-auto">
              Done
            </button>
          )}
        </div>
      )}
    </>
  );
}
