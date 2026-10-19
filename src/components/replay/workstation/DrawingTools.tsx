"use client";

import {
  CalendarRange,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Keyboard,
  Lock,
  Minus,
  MousePointer2,
  MoveRight,
  MoveVertical,
  Pin,
  RectangleHorizontal,
  Redo2,
  Slash,
  SunMoon,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrawTool } from "../chart/ReplayChart";

export const DRAW_COLORS = ["#2962ff", "#ff9800", "#9c27b0", "#00897b", "#f23645", "#787b86"];

/** TradingView-style position tool icons: green target over red stop (long) and inverse (short). */
function PositionIcon({ kind, className }: { kind: "long" | "short"; className?: string }) {
  const top = kind === "long" ? "#089981" : "#f23645";
  const bottom = kind === "long" ? "#f23645" : "#089981";
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <rect x="2" y="2" width="12" height="6" rx="1" fill={top} opacity="0.85" />
      <rect x="2" y="8" width="12" height="6" rx="1" fill={bottom} opacity="0.85" />
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
const LongIcon = ({ className }: { className?: string }) => <PositionIcon kind="long" className={className} />;
const ShortIcon = ({ className }: { className?: string }) => <PositionIcon kind="short" className={className} />;

function FibIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12" />
      <path d="M3 13 13 3" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

function VLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M8 1.5v13" />
    </svg>
  );
}

const TOOLS: { id: DrawTool; label: string; key?: string; icon: React.ElementType }[] = [
  { id: "cursor", label: "Cursor — select and move", key: "Alt+C", icon: MousePointer2 },
  { id: "crosshair", label: "Crosshair — snaps to candle OHLC", key: "Alt+X", icon: Crosshair },
  { id: "trend", label: "Trend line", key: "Alt+T", icon: Slash },
  { id: "hline", label: "Horizontal line", key: "Alt+H", icon: Minus },
  { id: "vline", label: "Vertical line", key: "Alt+V", icon: VLineIcon },
  { id: "ray", label: "Horizontal ray", key: "Alt+J", icon: MoveRight },
  { id: "rect", label: "Rectangle / zone", key: "Alt+R", icon: RectangleHorizontal },
  { id: "long", label: "Long position", key: "Alt+L", icon: LongIcon },
  { id: "short", label: "Short position", key: "Alt+S", icon: ShortIcon },
  { id: "fib", label: "Fibonacci retracement", key: "Alt+F", icon: FibIcon },
  { id: "text", label: "Text note", key: "Alt+N", icon: Type },
  { id: "pricerange", label: "Price range (pips, %, bars)", key: "Alt+P", icon: MoveVertical },
  { id: "daterange", label: "Date range (bars, duration)", key: "Alt+D", icon: CalendarRange },
];

export const TOOL_KEYS: Record<string, DrawTool> = Object.fromEntries(TOOLS.filter((t) => t.key).map((t) => [t.key!.split("+")[1].toLowerCase(), t.id]));

function Btn({ label, onClick, active, disabled, danger, children, testId }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted lg:h-[30px] lg:w-[30px]",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        danger && "hover:bg-loss-soft hover:text-loss",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <div className="mx-1 my-0.5 h-6 w-px shrink-0 bg-border lg:mx-0.5 lg:h-px lg:w-auto" />;

export default function DrawingTools(props: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  stay: boolean;
  onStay: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hidden: boolean;
  onHidden: (v: boolean) => void;
  shading: boolean;
  onShading: (v: boolean) => void;
  selectionLocked: boolean | null;
  onToggleLock: () => void;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  onShortcuts: () => void;
  count: number;
}) {
  const p = props;
  return (
    <div className="flex shrink-0 flex-row gap-0.5 overflow-x-auto border-b border-border bg-surface/80 p-1 no-scrollbar lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:border-b-0 lg:border-r" role="toolbar" aria-label="Drawing tools" data-testid="drawing-tools">
      {TOOLS.map((t) => (
        <Btn key={t.id} label={`${t.label}${t.key ? ` (${t.key})` : ""}`} onClick={() => p.onTool(t.id)} active={p.tool === t.id}>
          <t.icon className="h-4 w-4" />
        </Btn>
      ))}
      <Sep />
      <Btn label="Stay in drawing mode after placing (keep the tool)" onClick={() => p.onStay(!p.stay)} active={p.stay}>
        <Pin className="h-4 w-4" />
      </Btn>
      <Btn label="Undo drawing change (Ctrl/⌘+Z)" onClick={p.onUndo} disabled={!p.canUndo} testId="drawing-undo">
        <Undo2 className="h-4 w-4" />
      </Btn>
      <Btn label="Redo drawing change (Ctrl/⌘+Shift+Z)" onClick={p.onRedo} disabled={!p.canRedo} testId="drawing-redo">
        <Redo2 className="h-4 w-4" />
      </Btn>
      <Btn label={p.selectionLocked ? "Unlock selected drawing" : "Lock selected drawing"} onClick={p.onToggleLock} disabled={p.selectionLocked === null} active={Boolean(p.selectionLocked)}>
        {p.selectionLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </Btn>
      <Btn label={p.hidden ? "Show drawings" : "Hide drawings"} onClick={() => p.onHidden(!p.hidden)} active={p.hidden}>
        {p.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Btn>
      <Btn label="Shade trading sessions (Asia, London, New York)" onClick={() => p.onShading(!p.shading)} active={p.shading}>
        <SunMoon className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn label="Delete selected drawing (Delete)" onClick={p.onDeleteSelected} disabled={p.selectionLocked === null} danger>
        <Trash2 className="h-4 w-4" />
      </Btn>
      <Btn label="Remove all drawings" onClick={p.onClearAll} disabled={p.count === 0} danger>
        <Eraser className="h-4 w-4" />
      </Btn>
      <Btn label="Keyboard shortcuts (?)" onClick={p.onShortcuts}>
        <Keyboard className="h-4 w-4" />
      </Btn>
    </div>
  );
}

export { TOOLS as DRAWING_TOOLS };
