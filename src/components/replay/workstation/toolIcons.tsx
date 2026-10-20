import type { DrawTool } from "../chart/ReplayChart";

// TradingView-style drawing tool icons (thin strokes, 20px grid).

type IconProps = { className?: string };
const S = ({ className, children }: IconProps & { children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const CrossIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M10 2.5v15M2.5 10h15" />
  </S>
);
export const ArrowIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M5 3l10 6.2-4.4 1.2 2.6 4.8-1.6.9-2.6-4.8L5 14.5z" />
  </S>
);
export const TrendIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M4.6 15.4 15.4 4.6" />
    <circle cx="3.8" cy="16.2" r="1.3" />
    <circle cx="16.2" cy="3.8" r="1.3" />
  </S>
);
export const RayIcon = (p: IconProps) => (
  <S {...p}>
    <circle cx="4" cy="10" r="1.4" />
    <path d="M5.5 10h12" />
  </S>
);
export const HLineIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M2 10h16" />
    <circle cx="10" cy="10" r="1.4" />
  </S>
);
export const VLineIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M10 2v16" />
    <circle cx="10" cy="10" r="1.4" />
  </S>
);
export const FibIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M2.5 4h15M2.5 8h15M2.5 12h15M2.5 16h15" />
    <circle cx="4.5" cy="16" r="1.2" />
    <circle cx="15.5" cy="4" r="1.2" />
  </S>
);
export const RectIcon = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="5" width="13" height="10" rx="0.5" />
    <circle cx="3.5" cy="5" r="1.2" />
    <circle cx="16.5" cy="15" r="1.2" />
  </S>
);
export const TextIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M4.5 4.5h11M10 4.5v11.5M7.8 16h4.4" />
  </S>
);
export const PriceRangeIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M3.5 3.5h13M3.5 16.5h13M10 5.5v9M7.8 7.6 10 5.4l2.2 2.2M7.8 12.4 10 14.6l2.2-2.2" />
  </S>
);
export const DateRangeIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M3.5 3.5v13M16.5 3.5v13M5.5 10h9M7.6 7.8 5.4 10l2.2 2.2M12.4 7.8l2.2 2.2-2.2 2.2" />
  </S>
);
export function PositionIcon({ kind, className }: { kind: "long" | "short"; className?: string }) {
  const top = kind === "long" ? "#089981" : "#f23645";
  const bottom = kind === "long" ? "#f23645" : "#089981";
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <rect x="3" y="3" width="14" height="7" rx="1" fill={top} opacity="0.85" />
      <rect x="3" y="10" width="14" height="7" rx="1" fill={bottom} opacity="0.85" />
      <path d="M3 10h14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
export const LongIcon = (p: IconProps) => <PositionIcon kind="long" className={p.className} />;
export const ShortIcon = (p: IconProps) => <PositionIcon kind="short" className={p.className} />;
export const ProjectionGroupIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M3 16.5 7.5 11l3 2.5L17 5.5" />
    <path d="M13.5 5.5H17V9" />
    <circle cx="3" cy="16.5" r="1" />
  </S>
);
export const MagnetIcon = (p: IconProps) => (
  <S {...p}>
    <path d="M5 3.5v6.2a5 5 0 0 0 10 0V3.5h-3.2v6.2a1.8 1.8 0 0 1-3.6 0V3.5z" />
    <path d="M5 6.5h3.2M11.8 6.5H15" />
  </S>
);
export const StayIcon = (p: IconProps) => (
  <S {...p}>
    <path d="m12.8 3.7 2.5 2.5L7 14.5l-3.3.8.8-3.3z" />
    <rect x="12.5" y="13.5" width="5" height="4" rx="0.8" />
    <path d="M13.5 13.5v-1a1.5 1.5 0 0 1 3 0v1" />
  </S>
);

export interface ToolMeta {
  id: DrawTool;
  label: string;
  key?: string;
  icon: React.ComponentType<IconProps>;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolMeta[];
}

/** Left-toolbar groups, in TradingView's order. */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "cursors",
    label: "Cursors",
    tools: [
      { id: "crosshair", label: "Cross", key: "Alt+X", icon: CrossIcon },
      { id: "cursor", label: "Arrow", key: "Alt+C", icon: ArrowIcon },
    ],
  },
  {
    id: "lines",
    label: "Trend line tools",
    tools: [
      { id: "trend", label: "Trend line", key: "Alt+T", icon: TrendIcon },
      { id: "ray", label: "Horizontal ray", key: "Alt+J", icon: RayIcon },
      { id: "hline", label: "Horizontal line", key: "Alt+H", icon: HLineIcon },
      { id: "vline", label: "Vertical line", key: "Alt+V", icon: VLineIcon },
    ],
  },
  { id: "fib", label: "Fibonacci tools", tools: [{ id: "fib", label: "Fibonacci retracement", key: "Alt+F", icon: FibIcon }] },
  { id: "shapes", label: "Geometric shapes", tools: [{ id: "rect", label: "Rectangle", key: "Alt+R", icon: RectIcon }] },
  { id: "text", label: "Annotation tools", tools: [{ id: "text", label: "Text note", key: "Alt+N", icon: TextIcon }] },
  {
    id: "prediction",
    label: "Prediction and measurement",
    tools: [
      { id: "long", label: "Long position", key: "Alt+L", icon: LongIcon },
      { id: "short", label: "Short position", key: "Alt+S", icon: ShortIcon },
      { id: "pricerange", label: "Price range", key: "Alt+P", icon: PriceRangeIcon },
      { id: "daterange", label: "Date range", key: "Alt+D", icon: DateRangeIcon },
    ],
  },
];

export const ALL_TOOLS: ToolMeta[] = TOOL_GROUPS.flatMap((g) => g.tools);
export const toolMeta = (id: DrawTool): ToolMeta | undefined => ALL_TOOLS.find((t) => t.id === id);

/** Alt+letter → tool (matched on KeyboardEvent.code so it works on every layout). */
export const TOOL_KEYS: Record<string, DrawTool> = Object.fromEntries(ALL_TOOLS.filter((t) => t.key).map((t) => [t.key!.split("+")[1].toLowerCase(), t.id]));

export const DEFAULT_FAVORITES: DrawTool[] = ["rect", "fib", "pricerange", "trend", "ray", "hline"];

/** TradingView drawing colours. */
export const DRAW_COLORS = ["#2962ff", "#f5c451", "#ff9800", "#9c27b0", "#00897b", "#f23645", "#089981", "#787b86", "#ffffff"];
