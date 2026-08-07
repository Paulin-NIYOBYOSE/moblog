"use client";

import { createContext, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

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
      <AnimatePresence>
        {state && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => handleClose(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="relative z-10 w-full max-w-sm rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
            >
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
