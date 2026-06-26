"use client";

import { createContext, useContext, useState } from "react";
import type { Trade } from "@/lib/types";

interface ModalContextValue {
  openAdd: (date?: string | null) => void;
  openEdit: (trade: Trade) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({
  children,
  onOpen,
}: {
  children: React.ReactNode;
  onOpen: (payload: { trade: Trade | null; date: string | null }) => void;
}) {
  const value = {
    openAdd: (date?: string | null) => onOpen({ trade: null, date: date ?? null }),
    openEdit: (trade: Trade) => onOpen({ trade, date: null }),
  };
  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}
