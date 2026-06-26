"use client";

import { createContext, useContext, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      setState({ options, resolve });
    });
  }

  function handleClose(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => handleClose(false)}
          />
          <div className="relative z-10 w-full max-w-sm animate-pop-in rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loss/10">
                <AlertTriangle className="h-5 w-5 text-loss" />
              </div>
              <div>
                <h2 className="text-base font-semibold">{state.options.title}</h2>
                <p className="mt-1 text-sm text-muted">{state.options.message}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                {state.options.cancelText || "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                className="flex-1 rounded-lg bg-loss px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-loss/90"
              >
                {state.options.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
