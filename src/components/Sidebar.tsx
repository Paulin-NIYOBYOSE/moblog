"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  FileText,
  FlaskConical,
  Images,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  LogOut,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import ThemeToggle from "./ThemeToggle";
import type { Account } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Trading",
    items: [
      { label: "Trades", href: "/journal", icon: ListOrdered },
      { label: "Journal", href: "/daily-journal", icon: BookOpen },
    ],
  },
  {
    label: "Research",
    items: [
      { label: "Backtesting", href: "/backtesting", icon: CalendarCheck },
      { label: "Backtesting v2", href: "/backtesting-v2", icon: FlaskConical, badge: "New" },
      { label: "Gallery", href: "/backtesting/gallery", icon: Images },
    ],
  },
  {
    label: "Studio",
    items: [{ label: "Content", href: "/content", icon: FileText }],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[0.7rem] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_16px_-6px_var(--accent)]",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
      )}
      style={{ background: "linear-gradient(140deg, var(--accent-2) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 70%, black) 100%)" }}
    >
      <svg viewBox="0 0 24 24" className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17V9.5l4.5 5 4-6 3.5 4L20 6" />
        <path d="M4 20h16" opacity={0.45} />
      </svg>
    </div>
  );
}

export default function Sidebar({
  accounts,
  selectedAccount,
  onSelectAccount,
  onAddTrade,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  deletingAccountId,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  onSelectAccount: (a: Account) => void;
  onAddTrade: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
  deletingAccountId?: string | null;
  onLogout: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const [showAccounts, setShowAccounts] = useState(true);
  const activeNavLayoutId = useId();

  // Longest-prefix match so nested routes (e.g. Gallery under Backtesting)
  // don't light up their parent nav item too.
  const activeNavHref = ALL_NAV.reduce<string | null>((best, candidate) => {
    const matches =
      pathname === candidate.href || (candidate.href !== "/" && pathname.startsWith(`${candidate.href}/`));
    if (!matches) return best;
    return !best || candidate.href.length > best.length ? candidate.href : best;
  }, null);

  const content = (
    <>
      <div className="flex h-16 items-center justify-between gap-2.5 px-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={onCloseMobile}>
          <BrandMark />
          <div className="leading-none">
            <span className="block font-display text-[1.45rem] tracking-tight">Moblog</span>
            <span className="mt-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">Trading journal</span>
          </div>
        </Link>
      </div>

      <div className="flex gap-2 px-3 pb-2 pt-1">
        <button type="button" onClick={onAddTrade} className="btn btn-primary flex-1 py-2.5">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add trade
        </button>
        <Link
          href="/daily-journal?new=1"
          onClick={onCloseMobile}
          className="btn btn-secondary btn-icon h-auto w-11"
          title="New journal entry"
          aria-label="New journal entry"
        >
          <NotebookPen className="h-4 w-4" />
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === activeNavHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-[0.65rem] px-3 py-2 text-[0.84rem] font-medium transition-colors",
                      active ? "text-foreground" : "text-muted hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={activeNavLayoutId}
                        className="absolute inset-0 -z-10 rounded-[0.65rem] border border-border bg-card shadow-card"
                        transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                      />
                    )}
                    {!active && (
                      <span className="absolute inset-0 -z-10 rounded-[0.65rem] bg-surface-2 opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                    <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")} strokeWidth={2} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-md bg-gold-soft px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-gold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Account switcher */}
        <div>
          <button
            type="button"
            onClick={() => setShowAccounts((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint transition-colors hover:text-muted"
          >
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3 w-3" /> Accounts
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAccounts && "rotate-180")} />
          </button>
          <div className={cn("mt-1 space-y-1 overflow-hidden transition-all", showAccounts ? "max-h-[28rem]" : "max-h-0")}>
            {accounts.map((a) => {
              const selected = selectedAccount?.id === a.id;
              const pnl = a.netPnl ?? 0;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-[0.65rem] border px-2.5 py-2 text-sm transition-colors",
                    selected ? "border-border bg-card shadow-card" : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                  <button
                    type="button"
                    onClick={() => onSelectAccount(a)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase",
                        selected ? "bg-accent-soft text-accent" : "bg-surface-3 text-muted",
                      )}
                    >
                      {a.name.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[0.8rem] font-medium", selected && "text-foreground")}>{a.name}</span>
                      <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted">
                        {formatCurrency(a.balance ?? a.startingBalance, { compact: true })}
                        {pnl !== 0 && (
                          <span className={pnl > 0 ? "text-profit" : "text-loss"}>
                            {pnl > 0 ? "▲" : "▼"}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEditAccount(a)}
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
                      title="Edit account"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAccount(a)}
                      disabled={deletingAccountId === a.id}
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-loss-soft hover:text-loss disabled:opacity-60"
                      title="Delete account"
                    >
                      {deletingAccountId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onAddAccount}
              className="flex w-full items-center gap-2 rounded-[0.65rem] border border-dashed border-border-strong px-3 py-2 text-[0.8rem] text-muted transition-colors hover:border-accent/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New account
            </button>
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.8rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        <ThemeToggle />
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-[17rem] flex-col border-r border-border bg-surface/70 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:flex">
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
              onClick={onCloseMobile}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl lg:hidden"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
