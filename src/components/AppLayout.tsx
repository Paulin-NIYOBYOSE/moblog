"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Plus, X } from "lucide-react";
import { useData, logout } from "@/lib/useData";
import { useSelectedAccount } from "./AccountContext";
import Sidebar, { BrandMark } from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import type { Account } from "@/lib/types";

export default function AppLayout({
  children,
  onAddTrade,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  deletingAccountId,
}: {
  children: React.ReactNode;
  onAddTrade: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
  deletingAccountId?: string | null;
}) {
  const router = useRouter();
  const { accounts } = useData();
  const { selectedAccount, setSelectedAccountId } =
    useSelectedAccount(accounts);
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
        onAddTrade={() => {
          onAddTrade();
          setMobileMenuOpen(false);
        }}
        onAddAccount={() => {
          onAddAccount();
          setMobileMenuOpen(false);
        }}
        onEditAccount={(a) => {
          onEditAccount(a);
          setMobileMenuOpen(false);
        }}
        onDeleteAccount={(a) => {
          onDeleteAccount(a);
          setMobileMenuOpen(false);
        }}
        deletingAccountId={deletingAccountId}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="page-glow min-h-screen lg:pl-[17rem]">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/75 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((s) => !s)}
              aria-label="Toggle menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground"
            >
              {mobileMenuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
            <BrandMark size="sm" />
            <span className="font-display text-xl tracking-tight">Moblog</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button type="button" onClick={onAddTrade} className="btn btn-primary btn-sm">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
