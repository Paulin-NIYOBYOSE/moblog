"use client";

import { cn } from "@/lib/utils";
import type { DrawTool } from "../chart/ReplayChart";
import { toolMeta } from "./toolIcons";

/**
 * TradingView's favourites toolbar: the drawing tools you starred, one click
 * away. Shown only when the chart's top bar is wide enough, so it never pushes
 * Go to / undo out of view (e.g. with the order panel open).
 */
export default function FavoritesBar({ favorites, tool, onTool }: { favorites: DrawTool[]; tool: DrawTool; onTool: (t: DrawTool) => void }) {
  const tools = favorites.map(toolMeta).filter((t) => t !== undefined);
  if (!tools.length) return null;
  return (
    <div className="mx-2 hidden shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface-2/60 p-0.5 @min-[1200px]:flex" role="toolbar" aria-label="Favourite drawing tools" data-testid="favorites-bar">
      {tools.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            className={cn("flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2", tool === t.id ? "text-accent" : "text-foreground/80 hover:text-foreground")}
            title={t.label}
            aria-label={`${t.label} (favourite)`}
            aria-pressed={tool === t.id}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}
