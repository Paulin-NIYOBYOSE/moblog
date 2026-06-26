"use client";

import { createContext, useContext, useState } from "react";
import { X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "loading";
}

interface ToastHelpers {
  success: (message: string) => void;
  error: (message: string) => void;
  loading: (message: string) => string;
  remove: (id: string) => void;
}

interface ToastContextValue {
  toast: ToastHelpers;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function add(type: Toast["type"], message: string) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    if (type !== "loading") {
      setTimeout(() => remove(id), 3500);
    }
    return id;
  }

  const remove = (id: string) =>
    setToasts((t) => t.filter((x) => x.id !== id));

  const toast: ToastHelpers = {
    success: (message: string) => {
      add("success", message);
    },
    error: (message: string) => {
      add("error", message);
    },
    loading: (message: string) => add("loading", message),
    remove,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl animate-pop-in",
              t.type === "success" && "border-profit/30 bg-card text-foreground",
              t.type === "error" && "border-loss/30 bg-card text-foreground",
              t.type === "loading" && "border-border bg-card text-foreground",
            )}
          >
            {t.type === "success" && (
              <CheckCircle className="h-4 w-4 shrink-0 text-profit" />
            )}
            {t.type === "error" && (
              <AlertCircle className="h-4 w-4 shrink-0 text-loss" />
            )}
            {t.type === "loading" && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
            )}
            <span className="text-sm">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="ml-2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
