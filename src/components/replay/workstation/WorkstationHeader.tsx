"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, ChevronLeft, ChevronsRight, CircleHelp, Eye, EyeOff, Gauge, MoreHorizontal, Pause, Play, RotateCcw, Settings, SkipForward } from "lucide-react";
import { computeMetrics } from "@/lib/replay/analytics";
import { SPEEDS, type ControllerSnapshot } from "@/lib/replay/controller";
import { cn } from "@/lib/utils";
import Popover from "../Popover";
import { fmtPct, money } from "../format";

function Stat({ label, value, cls, hidden }: { label: string; value: string; cls?: string; hidden?: boolean }) {
  return (
    <div className="min-w-[5.5rem] px-3 text-center first:pl-4 last:pr-4">
      <div className="whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={cn("mt-0.5 whitespace-nowrap text-[0.88rem] font-semibold tabular-nums", !hidden && cls)}>{hidden ? "••••" : value}</div>
    </div>
  );
}

const roundBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted transition-colors hover:border-border-strong hover:text-foreground";

export default function WorkstationHeader({
  snap,
  onTogglePlay,
  onStep,
  onStepBase,
  onBack,
  onRestart,
  onSpeed,
  onRename,
  onStats,
  statsOpen,
  onSettings,
  onHelp,
  hideValues,
  onHideValues,
}: {
  snap: ControllerSnapshot;
  onTogglePlay: () => void;
  onStep: () => void;
  onStepBase: () => void;
  onBack: () => void;
  onRestart: () => void;
  onSpeed: (s: number) => void;
  onRename: (name: string) => void;
  onStats: () => void;
  statsOpen: boolean;
  onSettings: () => void;
  onHelp: () => void;
  hideValues: boolean;
  onHideValues: (v: boolean) => void;
}) {
  const { session, dataset } = snap;
  const s = session.settings;
  const ccy = s.accountCurrency;
  const [editingName, setEditingName] = useState<string | null>(null);
  const winRate = useMemo(() => computeMetrics(snap.trades, s.initialBalance).winRate, [snap.trades, s.initialBalance]);
  const realized = snap.balance - s.initialBalance;
  const total = Math.max(1, snap.endIndex - snap.startIndex);
  const progress = Math.min(100, Math.max(0, ((snap.index - snap.startIndex) / total) * 100));
  const tone = (v: number) => (v > 0.004 ? "text-profit" : v < -0.004 ? "text-loss" : "text-profit");

  return (
    <header className="relative z-30 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2 pt-3 sm:px-4 lg:flex-nowrap">
      <Link href={`/replay/session/${session.id}`} className={roundBtn} title="Back to the session" aria-label="Back to the session">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        {editingName !== null ? (
          <input
            autoFocus
            className="input !h-9 !w-56 !rounded-full !py-1 text-sm font-semibold"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={() => {
              if (editingName.trim()) onRename(editingName.trim());
              setEditingName(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingName(null);
            }}
            aria-label="Session name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(session.name)}
            className="block max-w-[14rem] truncate text-left text-[1.15rem] font-bold tracking-tight hover:text-accent 2xl:max-w-[20rem]"
            title={`${session.name} — click to rename`}
          >
            {session.name}
          </button>
        )}
      </div>

      {/* Playback */}
      <div className="relative flex items-center gap-0.5 overflow-hidden rounded-2xl border border-border bg-card p-1" role="group" aria-label="Replay controls">
        <button type="button" onClick={onBack} disabled={snap.index <= snap.startIndex} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-35" title="Previous candle (←)" aria-label="Previous candle" data-testid="replay-back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={snap.atEnd}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors disabled:opacity-40",
            snap.playing ? "border-accent bg-accent-soft text-accent" : "border-foreground/70 text-foreground hover:bg-surface-2",
          )}
          aria-label={snap.playing ? "Pause" : "Play"}
          title={snap.playing ? "Pause (Space)" : "Play (Space)"}
          data-testid="replay-play"
        >
          {snap.playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {snap.playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onStep} disabled={snap.atEnd} className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-40" title="Next candle (→)" aria-label="Next candle" data-testid="replay-next">
          <SkipForward className="h-3.5 w-3.5" /> Next
        </button>
        {session.timeframe !== dataset.timeframe && (
          <button type="button" onClick={onStepBase} disabled={snap.atEnd} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-40" title={`Step one ${dataset.timeframe} candle — builds the current candle (Shift+→)`} aria-label={`Step one ${dataset.timeframe} candle`} data-testid="replay-substep">
            <ChevronsRight className="h-4 w-4" />
          </button>
        )}
        <Popover
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold hover:bg-surface-2" title="Playback speed" aria-label={`Playback speed ${snap.speed}×`} data-testid="replay-speed">
              <Gauge className="h-3.5 w-3.5" /> {snap.speed}×
            </button>
          )}
          className="w-56 !p-1.5"
        >
          {(close) => (
            <div role="menu" aria-label="Playback speed">
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted">Chart candles per second while playing</p>
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  role="menuitemradio"
                  aria-checked={snap.speed === sp}
                  onClick={() => {
                    onSpeed(sp);
                    close();
                  }}
                  className={cn("flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2", snap.speed === sp && "text-accent")}
                >
                  {sp}× <span className="text-xs text-muted">{sp} candle{sp === 1 ? "" : "s"}/s</span>
                </button>
              ))}
            </div>
          )}
        </Popover>
        <Popover
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground" title="More replay actions" aria-label="More replay actions">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          className="w-52 !p-1.5"
        >
          {(close) => (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
              onClick={() => {
                close();
                onRestart();
              }}
              data-testid="replay-restart"
            >
              <RotateCcw className="h-4 w-4 text-muted" /> Restart session
            </button>
          )}
        </Popover>
        <span className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
          <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${progress}%` }} />
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden divide-x divide-border rounded-2xl border border-border bg-card py-2 2xl:flex" data-testid="balance-cards">
          <Stat label="Starting balance" value={money(s.initialBalance, ccy)} hidden={hideValues} />
          <Stat label="Current balance" value={money(snap.balance, ccy)} hidden={hideValues} />
        </div>
        <div className="hidden divide-x divide-border rounded-2xl border border-border bg-card py-2 xl:flex" data-testid="header-stats">
          <Stat label="Win rate" value={fmtPct(winRate ?? 0)} />
          <Stat label="Total trades" value={String(snap.trades.length)} />
          <Stat label="Realized P&L" value={money(realized, ccy)} cls={tone(realized)} hidden={hideValues} />
          <Stat label="Unrealized P&L" value={money(snap.unrealized, ccy)} cls={tone(snap.unrealized)} hidden={hideValues} />
        </div>
        <button
          type="button"
          onClick={onStats}
          aria-pressed={statsOpen}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors",
            statsOpen ? "border-info bg-info text-white" : "border-info/70 bg-info-soft text-info hover:bg-info/20",
          )}
          data-testid="open-stats"
        >
          <BarChart3 className="h-4 w-4" /> Stats
        </button>
        <button type="button" className={roundBtn} onClick={() => onHideValues(!hideValues)} title={hideValues ? "Show balances" : "Hide balances"} aria-label={hideValues ? "Show balances" : "Hide balances"} aria-pressed={hideValues}>
          {hideValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button type="button" className={roundBtn} onClick={onSettings} title="Session settings" aria-label="Session settings" data-testid="replay-settings">
          <Settings className="h-4 w-4" />
        </button>
        <button type="button" className={roundBtn} onClick={onHelp} title="Keyboard shortcuts and help (?)" aria-label="Keyboard shortcuts and help">
          <CircleHelp className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
