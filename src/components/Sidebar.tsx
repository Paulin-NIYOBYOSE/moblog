"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  LogOut,
  Plus,
  Wallet,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import type { Account } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Trades", href: "/journal", icon: ListOrdered },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

export default function Sidebar({
  accounts,
  selectedAccount,
  onSelectAccount,
  onAddTrade,
  onAddAccount,
  onLogout,
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  onSelectAccount: (a: Account) => void;
  onAddTrade: () => void;
  onAddAccount: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [showAccounts, setShowAccounts] = useState(false);

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <LineChart className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">
            Moblog
          </span>
        </Link>
      </div>

      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onAddTrade}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-transform hover:opacity-95 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Trade
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}

        {/* Account switcher */}
        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowAccounts((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted transition-colors hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Accounts
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showAccounts && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "mt-1 space-y-0.5 overflow-hidden transition-all",
              showAccounts ? "max-h-64" : "max-h-0",
            )}
          >
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAccount(a)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  selectedAccount?.id === a.id
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span className="truncate">{a.name}</span>
                <span className="text-xs tabular-nums text-muted">
                  {formatCurrency(a.balance ?? a.startingBalance, {
                    compact: true,
                  })}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={onAddAccount}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New account
            </button>
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
