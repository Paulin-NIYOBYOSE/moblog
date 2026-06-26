"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Account } from "@/lib/types";

interface AccountContextValue {
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("moblog-selected-account");
      if (saved) setSelectedAccountId(saved);
    } catch {
      // ignore storage errors
    }
  }, []);

  function setAndPersist(id: string | null) {
    setSelectedAccountId(id);
    try {
      if (id) localStorage.setItem("moblog-selected-account", id);
      else localStorage.removeItem("moblog-selected-account");
    } catch {
      // ignore storage errors
    }
  }

  return (
    <AccountContext.Provider value={{ selectedAccountId, setSelectedAccountId: setAndPersist }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useSelectedAccount(accounts: Account[]) {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useSelectedAccount must be used within AccountProvider");
  const selected = accounts.find((a) => a.id === ctx.selectedAccountId) || accounts[0] || null;
  return { selectedAccount: selected, setSelectedAccountId: ctx.setSelectedAccountId, selectedAccountId: ctx.selectedAccountId };
}
