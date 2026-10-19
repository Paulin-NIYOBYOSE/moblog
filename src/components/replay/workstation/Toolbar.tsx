"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Cloud,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Settings2,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { SPEEDS, type ControllerSnapshot } from "@/lib/replay/controller";
import { availableTimeframes, DISPLAY_TIMEZONES, formatInTz, fromInputValue, toInputValue } from "@/lib/replay/time";
import type { Timeframe } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import Popover from "../Popover";
import IndicatorMenu from "./IndicatorMenu";
import type { IndicatorConfig } from "@/lib/replay/types";

function IconBtn({
  label,
  onClick,
  children,
  disabled,
  active,
  testId,
  kbd,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
  kbd?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={kbd ? `${label} (${kbd})` : label}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

export default function Toolbar({
  snap,
  onTogglePlay,
  onStep,
  onStepBase,
  onBack,
  onRestart,
  onSpeed,
  onTimeframe,
  onJump,
  onRename,
  onIndicators,
  onTimezone,
  onScreenshot,
  onSettings,
  onSave,
  ticketOpen,
  onToggleTicket,
}: {
  snap: ControllerSnapshot;
  onTogglePlay: () => void;
  onStep: () => void;
  onStepBase: () => void;
  onBack: () => void;
  onRestart: () => void;
  onSpeed: (s: number) => void;
  onTimeframe: (tf: Timeframe) => void;
  onJump: (t: number) => void;
  onRename: (name: string) => void;
  onIndicators: (list: IndicatorConfig[]) => void;
  onTimezone: (tz: string) => void;
  onScreenshot: () => void;
  onSettings: () => void;
  onSave: () => void;
  ticketOpen: boolean;
  onToggleTicket: () => void;
}) {
  const { session, dataset } = snap;
  const tz = session.displayTimezone;
  const [editingName, setEditingName] = useState<string | null>(null);
  const [jumpValue, setJumpValue] = useState("");
  const total = Math.max(1, snap.endIndex - snap.startIndex);
  const progress = ((snap.index - snap.startIndex) / total) * 100;
  const tfs = availableTimeframes(dataset.timeframe);

  return (
    <header className="relative z-30 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface/90 px-2 py-1.5 backdrop-blur-xl">
      <Link href="/replay" className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground" title="Back to Replay sessions">
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Replay</span>
      </Link>
      <div className="min-w-0">
        {editingName !== null ? (
          <input
            autoFocus
            className="input !w-48 !py-1 text-sm"
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
          <button type="button" onClick={() => setEditingName(session.name)} className="max-w-[11rem] truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-surface-2 2xl:max-w-[16rem]" title={`${session.name} — click to rename`}>
            {session.name}
          </button>
        )}
      </div>
      <span className="hidden rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-bold tracking-wide 2xl:inline">{session.symbol}</span>

      <div className="flex items-center rounded-[0.65rem] border border-border bg-surface-2 p-0.5" role="tablist" aria-label="Timeframe">
        {tfs.map((tf) => (
          <button
            key={tf}
            type="button"
            role="tab"
            aria-selected={session.timeframe === tf}
            onClick={() => onTimeframe(tf)}
            className={cn(
              "h-6 rounded-[0.5rem] px-1.5 text-[11px] font-semibold transition-colors",
              session.timeframe === tf ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="mx-1 hidden h-6 w-px bg-border md:block" />

      <div className="flex items-center gap-0.5">
        <IconBtn label="Restart session" onClick={onRestart} testId="replay-restart">
          <RotateCcw className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Previous candle" onClick={onBack} disabled={snap.index <= snap.startIndex} testId="replay-back" kbd="←">
          <ChevronLeft className="h-4.5 w-4.5" />
        </IconBtn>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={snap.atEnd}
          className="flex h-8 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label={snap.playing ? "Pause" : "Play"}
          title={snap.playing ? "Pause (Space)" : "Play (Space)"}
          data-testid="replay-play"
        >
          {snap.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <IconBtn label="Next candle" onClick={onStep} disabled={snap.atEnd} testId="replay-next" kbd="→">
          <ChevronRight className="h-4.5 w-4.5" />
        </IconBtn>
        {session.timeframe !== dataset.timeframe && (
          <IconBtn label={`Step one ${dataset.timeframe} candle (builds the current candle)`} onClick={onStepBase} disabled={snap.atEnd} testId="replay-substep" kbd="Shift+→">
            <ChevronsRight className="h-4 w-4" />
          </IconBtn>
        )}
        <div className="ml-1 flex items-center rounded-md border border-border bg-surface-2 p-px" role="group" aria-label="Playback speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => onSpeed(sp)}
              aria-pressed={snap.speed === sp}
              title={`${sp} chart candle${sp === 1 ? "" : "s"} per second of real time while playing (market time advances by whole candles)`}
              className={cn("h-6 rounded px-1.5 text-[10.5px] font-semibold tabular-nums", snap.speed === sp ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground")}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>

      <Popover
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={() => {
              setJumpValue(toInputValue(snap.nowT, tz));
              toggle();
            }}
            className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-left hover:bg-surface-2"
            title="Jump to date"
            data-testid="replay-time"
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="flex flex-col leading-tight">
              <span className="text-[11.5px] font-semibold tabular-nums">{formatInTz(snap.nowT, tz, "datetime")}</span>
              <span className="relative mt-0.5 h-1 w-full min-w-[7rem] overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
                <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </span>
            </span>
          </button>
        )}
        className="w-72"
      >
        {(close) => (
          <div className="space-y-2">
            <div className="text-xs font-semibold">Jump to date</div>
            <input
              type="datetime-local"
              className="input !py-1.5"
              value={jumpValue}
              min={toInputValue(snap.session.startT, tz)}
              max={toInputValue(snap.session.endT, tz)}
              onChange={(e) => setJumpValue(e.target.value)}
              aria-label="Replay date and time"
            />
            <p className="text-[11px] text-muted">
              Times in {DISPLAY_TIMEZONES.find((z) => z.value === tz)?.label ?? tz}. Jumping forward processes every candle in between (orders can fill). Jumping back undoes later actions.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm w-full"
              onClick={() => {
                const t = fromInputValue(jumpValue, tz);
                if (t !== null) onJump(t);
                close();
              }}
            >
              Go
            </button>
          </div>
        )}
      </Popover>

      <div className="ml-auto flex items-center gap-0.5">
        <IndicatorMenu indicators={session.indicators} onChange={onIndicators} />
        <select
          className="h-8 w-[5.5rem] truncate rounded-lg border border-transparent bg-transparent px-1.5 text-[11px] font-medium text-muted hover:border-border focus:border-accent focus:outline-none"
          value={tz}
          onChange={(e) => onTimezone(e.target.value)}
          aria-label="Display time zone"
          title="Display time zone"
        >
          {DISPLAY_TIMEZONES.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
        <IconBtn label="Download chart screenshot" onClick={onScreenshot}>
          <Camera className="h-4 w-4" />
        </IconBtn>
        <span className="hidden lg:inline-flex">
          <IconBtn label={ticketOpen ? "Hide order panel" : "Show order panel"} onClick={onToggleTicket} active={!ticketOpen}>
            {ticketOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </IconBtn>
        </span>
        <IconBtn label="Session settings" onClick={onSettings} testId="replay-settings">
          <Settings2 className="h-4 w-4" />
        </IconBtn>
        <button
          type="button"
          onClick={onSave}
          className={cn(
            "flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium",
            snap.saveState === "error" ? "text-loss hover:bg-loss-soft" : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
          title={snap.saveError ?? "Saved to the database. Click to save now."}
          data-testid="replay-save"
        >
          {snap.saveState === "saving" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : snap.saveState === "error" ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : snap.saveState === "dirty" ? (
            <Cloud className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5 text-profit" />
          )}
          <span className="hidden 2xl:inline">{snap.saveState === "saved" ? "Saved" : snap.saveState === "saving" ? "Saving…" : snap.saveState === "error" ? "Save failed" : "Save"}</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
