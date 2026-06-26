"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Menu, Plus, X } from "lucide-react";
import { useData, logout } from "@/lib/useData";
import { useSelectedAccount } from "./AccountContext";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import type { Account } from "@/lib/types";

export default function AppLayout({
  children,
  onAddTrade,
  onAddAccount,
  onEditAccount,
}: {
  children: React.ReactNode;
  onAddTrade: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
}) {
  const router = useRouter();
  const { accounts } = useData();
  const { selectedAccount, setSelectedAccountId } = useSelectedAccount(accounts);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={(a) => {
          setSelectedAccountId(a.id);
          setMobileMenuOpen(false);
        }}
        onAddTrade={onAddTrade}
        onAddAccount={() => {
          onAddAccount();
          setMobileMenuOpen(false);
        }}
        onEditAccount={(a) => {
          onEditAccount(a);
          setMobileMenuOpen(false);
        }}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((s) => !s)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground hover:bg-surface-2"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <LineChart className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <span className="text-base font-semibold">Moblog</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onAddTrade}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
