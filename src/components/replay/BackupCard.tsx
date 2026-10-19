"use client";

import { useEffect, useState } from "react";
import { Database, Download, HardDriveUpload, Loader2, Upload } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Inputs";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import { exportBackup, importBackup, storageStatus, type StorageStatus } from "@/lib/replay/storage/repo";
import { deleteLegacyData, legacyInventory, readLegacyBackup } from "@/lib/replay/storage/legacy";
import { notifyReplayChanged } from "@/lib/replay/useReplayData";

export function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}

/** Database usage of Replay's tables (candles, sessions, journal). */
export function StorageMeter({ compact = false }: { compact?: boolean }) {
  const [st, setSt] = useState<StorageStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      storageStatus()
        .then((s) => alive && (setSt(s), setErr(null)))
        .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    void load();
    const on = () => void load();
    window.addEventListener("replay-db-changed", on);
    return () => {
      alive = false;
      window.removeEventListener("replay-db-changed", on);
    };
  }, []);
  if (err) return <div className="rounded-xl border border-loss/30 bg-loss-soft p-3 text-xs text-loss">{err}</div>;
  if (!st) return <div className="h-[72px] animate-pulse rounded-xl border border-border bg-surface-2" />;
  const s = st.storage;
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`${s.candles.toLocaleString()} candles over ${s.days.toLocaleString()} days in ${s.datasets} dataset(s); ${s.sessions} session(s)`}>
        <Database className="h-3.5 w-3.5" /> {bytes(s.bytes)} in database
      </span>
    );
  }
  return (
    <div className="rounded-xl border border-border p-3" data-testid="storage-meter">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <Database className="h-3.5 w-3.5 text-muted" /> Database storage
        </span>
        <span className="tabular-nums text-muted">{bytes(s.bytes)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-faint">Candles</dt>
          <dd className="font-semibold tabular-nums">{s.candles.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-faint">Trading days</dt>
          <dd className="font-semibold tabular-nums">{s.days.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-faint">Sessions</dt>
          <dd className="font-semibold tabular-nums">{s.sessions}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-muted">Stored in this app&apos;s PostgreSQL database — available from any browser you sign in from.</p>
    </div>
  );
}

export default function BackupCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [includeCandles, setIncludeCandles] = useState(false);
  const [busy, setBusy] = useState<"export" | "import" | "legacy" | null>(null);
  const [legacy, setLegacy] = useState<{ sessions: number; datasets: number } | null>(null);

  useEffect(() => {
    void legacyInventory().then(setLegacy);
  }, []);

  const doExport = async () => {
    setBusy("export");
    try {
      const blob = await exportBackup(includeCandles);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replay-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Backup exported (${bytes(blob.size)})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("import");
    try {
      const raw = JSON.parse(await file.text());
      const overwrite = await confirm({
        title: "Restore backup",
        message: "Replace items that already exist (same id) with the versions from the backup? Choose Keep existing to only add new ones.",
        confirmText: "Replace existing",
        cancelText: "Keep existing",
      });
      const r = await importBackup(raw, overwrite);
      notifyReplayChanged();
      toast.success(`Restored ${r.sessions} sessions, ${r.datasets} datasets${r.skipped ? ` (${r.skipped} skipped)` : ""}`);
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "That file isn't valid JSON." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const moveLegacy = async () => {
    setBusy("legacy");
    try {
      const backup = await readLegacyBackup();
      const r = await importBackup(backup, false);
      notifyReplayChanged();
      toast.success(`Moved ${r.sessions} sessions and ${r.datasets} datasets into the database`);
      const wipe = await confirm({
        title: "Remove the old browser copy?",
        message: "Your data is now in the database. Delete the old copy from this browser? (Recommended — it isn't used any more.)",
        confirmText: "Delete browser copy",
        cancelText: "Keep it",
        destructive: true,
      });
      if (wipe) {
        await deleteLegacyData();
        setLegacy(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader icon={Database} title="Data & backups" subtitle="Sessions, journals and candles are stored in the app's database. Export a JSON backup to keep a copy or move to another installation." />
      {legacy && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm">
          <span className="text-foreground">
            This browser still holds {legacy.sessions} session(s) and {legacy.datasets} dataset(s) from an earlier version of Replay that stored data locally.
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void moveLegacy()} disabled={busy !== null} data-testid="move-legacy">
            {busy === "legacy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveUpload className="h-4 w-4" />} Move to database
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Toggle
            checked={includeCandles}
            onChange={setIncludeCandles}
            label="Include imported candles"
            description="Adds candles from files you imported (about 20 MB per year of M1). Downloaded FXCM data is never included — it re-downloads automatically."
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => void doExport()} disabled={busy !== null}>
              {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export backup
            </button>
            <label className="btn btn-secondary cursor-pointer">
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore backup
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doImport(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <StorageMeter />
      </div>
    </Card>
  );
}
