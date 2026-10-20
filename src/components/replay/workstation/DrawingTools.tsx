"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Layers, Lock, LockOpen, Star, Trash2, ZoomIn } from "lucide-react";
import type { Drawing } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import type { DrawTool } from "../chart/ReplayChart";
import { MagnetIcon, StayIcon, TOOL_GROUPS, toolMeta, type ToolGroup } from "./toolIcons";

export { DRAW_COLORS, TOOL_KEYS } from "./toolIcons";

export const DRAWING_NAMES: Record<Drawing["kind"], string> = {
  hline: "Horizontal line",
  vline: "Vertical line",
  trend: "Trend line",
  rect: "Rectangle",
  ray: "Horizontal ray",
  long: "Long position",
  short: "Short position",
  fib: "Fib retracement",
  text: "Text",
  pricerange: "Price range",
  daterange: "Date range",
};

const railBase = "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 disabled:opacity-35 disabled:hover:bg-transparent";
const railIdle = "text-foreground/75 hover:text-foreground";
const railOn = "text-accent";
const railBtn = `${railBase} ${railIdle}`;

function RailButton({
  label,
  onClick,
  active,
  disabled,
  danger,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      className={cn(railBase, active ? railOn : danger ? "text-foreground/75 hover:bg-loss-soft hover:text-loss" : railIdle)}
    >
      {children}
    </button>
  );
}

/**
 * Fixed-position placement for a rail menu, so the rail itself can scroll on
 * short screens without clipping its menus. Beside the button on desktop (or
 * anchored to its bottom edge with `upward`), below it on phones. Closes on
 * outside press, Escape, scroll and resize.
 */
function useRailMenu(upward = false) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  // The anchor element as state (a callback ref), so render code never reads a ref.
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const open = pos !== null;
  const close = () => setPos(null);
  const toggle = () => {
    if (open) return close();
    const r = anchor?.getBoundingClientRect();
    if (!r) return;
    const desktop = window.innerWidth >= 1024;
    if (!desktop) setPos({ position: "fixed", left: Math.max(8, Math.min(r.left, window.innerWidth - 272)), top: r.bottom + 6 });
    else if (upward) setPos({ position: "fixed", left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) });
    else setPos({ position: "fixed", left: r.right + 8, top: Math.max(8, Math.min(r.top, window.innerHeight - 280)) });
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (anchor && !anchor.contains(e.target as Node)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const onMove = () => setPos(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, anchor]);
  return { attach: setAnchor, pos, open, toggle, close };
}

const menuCls = "z-50 w-64 animate-pop-in rounded-xl border border-border bg-card p-1.5 shadow-xl";

/** A tool group: shows its last-used tool; the corner arrow opens the list. */
function GroupButton({ group, tool, onTool, favorites, onFavorite }: { group: ToolGroup; tool: DrawTool; onTool: (t: DrawTool) => void; favorites: DrawTool[]; onFavorite: (t: DrawTool) => void }) {
  const [last, setLast] = useState<DrawTool>(group.tools[0].id);
  const { attach, pos, open, toggle, close } = useRailMenu();
  const inGroup = group.tools.some((t) => t.id === tool);
  const shown = toolMeta(inGroup ? tool : last) ?? group.tools[0];
  const Icon = shown.icon;
  return (
    <div ref={attach} className="group/tool relative">
      <button
        type="button"
        onClick={() => onTool(shown.id)}
        title={`${shown.label}${shown.key ? ` (${shown.key})` : ""}`}
        aria-label={`${shown.label}${shown.key ? ` (${shown.key})` : ""}`}
        aria-pressed={tool === shown.id}
        className={cn(railBase, tool === shown.id ? railOn : railIdle)}
      >
        <Icon className="h-[22px] w-[22px]" />
      </button>
      {group.tools.length > 1 && (
        <button
          type="button"
          onClick={toggle}
          className="absolute -right-1 bottom-0 top-0 hidden w-2.5 items-center justify-center text-faint hover:text-foreground lg:flex lg:opacity-0 lg:group-hover/tool:opacity-100"
          aria-label={`More ${group.label.toLowerCase()}`}
          aria-expanded={open}
        >
          <svg viewBox="0 0 6 10" className="h-2.5 w-1.5" fill="currentColor" aria-hidden>
            <path d="M1 1l4 4-4 4z" />
          </svg>
        </button>
      )}
      {open && (
        <div className={menuCls} style={pos!} role="menu" aria-label={group.label}>
          <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{group.label}</div>
          {group.tools.map((t) => {
            const fav = favorites.includes(t.id);
            return (
              <div key={t.id} className={cn("flex items-center rounded-lg hover:bg-surface-2", tool === t.id && "text-accent")}>
                <button
                  type="button"
                  role="menuitem"
                  className="flex flex-1 items-center gap-2.5 px-2 py-1.5 text-left text-sm"
                  onClick={() => {
                    setLast(t.id);
                    onTool(t.id);
                    close();
                  }}
                >
                  <t.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{t.label}</span>
                  {t.key && <kbd className="text-[10.5px] text-faint">{t.key}</kbd>}
                </button>
                <button
                  type="button"
                  onClick={() => onFavorite(t.id)}
                  className="px-2 py-1.5"
                  aria-label={fav ? `Remove ${t.label} from favourites` : `Add ${t.label} to favourites`}
                  aria-pressed={fav}
                >
                  <Star className={cn("h-3.5 w-3.5", fav ? "fill-accent text-accent" : "text-faint hover:text-foreground")} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Rail button that opens a fixed-position menu (beside it on desktop). */
function RailMenu({ upward, button, children }: { upward?: boolean; button: (toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const { attach, pos, open, toggle, close } = useRailMenu(upward);
  return (
    <div ref={attach} className="relative">
      {button(toggle)}
      {open && (
        <div className={menuCls} style={pos!}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

const Sep = () => <div className="mx-1.5 my-1 h-px w-auto shrink-0 bg-border max-lg:mx-0.5 max-lg:h-6 max-lg:w-px" />;

export default function DrawingTools(props: {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  stay: boolean;
  onStay: (v: boolean) => void;
  magnet: boolean;
  onMagnet: (v: boolean) => void;
  lockAll: boolean;
  onLockAll: (v: boolean) => void;
  hidden: boolean;
  onHidden: (v: boolean) => void;
  onZoomIn: () => void;
  onRemoveDrawings: () => void;
  onRemoveIndicators: () => void;
  indicatorCount: number;
  favorites: DrawTool[];
  onFavorite: (t: DrawTool) => void;
  favBar: boolean;
  onFavBar: (v: boolean) => void;
  drawings: Drawing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const p = props;
  return (
    <div
      className="flex shrink-0 flex-row items-center gap-0.5 overflow-x-auto border-b border-border px-1 py-1 no-scrollbar lg:h-full lg:w-[52px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:px-0 lg:py-2"
      role="toolbar"
      aria-label="Drawing tools"
      data-testid="drawing-tools"
    >
      {TOOL_GROUPS.map((g) => (
        <GroupButton key={g.id} group={g} tool={p.tool} onTool={p.onTool} favorites={p.favorites} onFavorite={p.onFavorite} />
      ))}
      <RailButton label="Zoom in" onClick={p.onZoomIn}>
        <ZoomIn className="h-5 w-5" strokeWidth={1.4} />
      </RailButton>
      <Sep />
      <RailButton
        label={p.magnet ? "Magnet on — points snap to candle open/high/low/close" : "Magnet — snap points to candle open/high/low/close"}
        onClick={() => p.onMagnet(!p.magnet)}
        active={p.magnet}
      >
        <MagnetIcon className="h-[22px] w-[22px]" />
      </RailButton>
      <RailButton label="Stay in drawing mode (keep the tool after placing)" onClick={() => p.onStay(!p.stay)} active={p.stay}>
        <StayIcon className="h-[22px] w-[22px]" />
      </RailButton>
      <RailButton label={p.lockAll ? "Unlock all drawings" : "Lock all drawings"} onClick={() => p.onLockAll(!p.lockAll)} active={p.lockAll}>
        {p.lockAll ? <Lock className="h-5 w-5" strokeWidth={1.4} /> : <LockOpen className="h-5 w-5" strokeWidth={1.4} />}
      </RailButton>
      <RailButton label={p.hidden ? "Show drawings" : "Hide drawings"} onClick={() => p.onHidden(!p.hidden)} active={p.hidden}>
        {p.hidden ? <EyeOff className="h-5 w-5" strokeWidth={1.4} /> : <Eye className="h-5 w-5" strokeWidth={1.4} />}
      </RailButton>
      <RailMenu
        button={(toggle) => (
          <button
            type="button"
            onClick={toggle}
            className={cn(railBase, "text-foreground/75 hover:bg-loss-soft hover:text-loss")}
            title="Remove objects"
            aria-label="Remove objects"
            data-testid="remove-objects"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.4} />
          </button>
        )}
      >
        {(close) => (
          <div role="menu">
            {(
              [
                [`Remove ${p.drawings.length} drawing${p.drawings.length === 1 ? "" : "s"}`, p.drawings.length === 0, p.onRemoveDrawings],
                [`Remove ${p.indicatorCount} indicator${p.indicatorCount === 1 ? "" : "s"}`, p.indicatorCount === 0, p.onRemoveIndicators],
                [
                  "Remove drawings & indicators",
                  p.drawings.length + p.indicatorCount === 0,
                  () => {
                    p.onRemoveDrawings();
                    p.onRemoveIndicators();
                  },
                ],
              ] as [string, boolean, () => void][]
            ).map(([label, disabled, run]) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  close();
                  run();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted" /> {label}
              </button>
            ))}
          </div>
        )}
      </RailMenu>

      <div className="flex-1 max-lg:hidden" />
      <RailButton label={p.favBar ? "Hide favourites toolbar" : "Show favourites toolbar"} onClick={() => p.onFavBar(!p.favBar)} active={p.favBar}>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", p.favBar ? "bg-info text-white" : "")}>
          <Star className={cn("h-4 w-4", p.favBar && "fill-white")} />
        </span>
      </RailButton>
      <RailMenu
        upward
        button={(toggle) => (
          <button type="button" onClick={toggle} className={railBtn} title="Object tree" aria-label="Object tree" data-testid="object-tree">
            <Layers className="h-5 w-5" strokeWidth={1.4} />
          </button>
        )}
      >
        {() => (
          <>
            <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Object tree</div>
            {p.drawings.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">No drawings on this chart yet.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {[...p.drawings].reverse().map((d) => (
                  <li key={d.id} className={cn("flex items-center gap-1 rounded-lg pr-1 hover:bg-surface-2", d.id === p.selectedId && "bg-accent-soft")}>
                    <button type="button" onClick={() => p.onSelect(d.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: d.kind === "long" ? "#089981" : d.kind === "short" ? "#f23645" : d.color,
                        }}
                      />
                      <span className="truncate">{DRAWING_NAMES[d.kind]}</span>
                      {(d.text || d.label) && <span className="truncate text-xs text-muted">“{d.text ?? d.label}”</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onToggleLock(d.id)}
                      className="rounded p-1 text-muted hover:text-foreground"
                      aria-label={d.locked ? "Unlock" : "Lock"}
                      title={d.locked ? "Unlock" : "Lock"}
                    >
                      {d.locked ? <Lock className="h-3.5 w-3.5 text-accent" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => p.onDelete(d.id)} className="rounded p-1 text-muted hover:text-loss" aria-label="Delete" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </RailMenu>
    </div>
  );
}
