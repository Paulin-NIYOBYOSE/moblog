"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeSnapshot {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
}

interface ThemeContextValue extends ThemeSnapshot {
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "moblog-theme";
const SERVER_SNAPSHOT: ThemeSnapshot = { mode: "system", resolvedTheme: "light" };

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function computeSnapshot(): ThemeSnapshot {
  return { mode: readMode(), resolvedTheme: readResolvedTheme() };
}

// Captured once, at module-eval time on the client — by then the inline
// FOUC-avoidance script in layout.tsx has already run (it's a synchronous
// <script> in <head>, before any bundled JS executes) so this reflects the
// real starting theme, not a placeholder.
let clientSnapshot: ThemeSnapshot =
  typeof document !== "undefined" ? computeSnapshot() : SERVER_SNAPSHOT;

const listeners = new Set<() => void>();

function commit(next: ThemeSnapshot) {
  if (next.mode === clientSnapshot.mode && next.resolvedTheme === clientSnapshot.resolvedTheme) {
    return;
  }
  clientSnapshot = next;
  listeners.forEach((listener) => listener());
}

/** Applies a mode to the DOM (class + data attribute) and returns what it resolved to. */
function applyDom(mode: ThemeMode): ResolvedTheme {
  const dark =
    mode === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme-mode", mode);
  return dark ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Live-update while in "system" mode; a no-op commit when an explicit
  // mode is active since resolvedTheme/mode won't have changed.
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    if (readMode() === "system") {
      commit({ mode: "system", resolvedTheme: applyDom("system") });
    }
  };
  mql.addEventListener("change", onMediaChange);
  return () => {
    listeners.delete(listener);
    mql.removeEventListener("change", onMediaChange);
  };
}

function getSnapshot(): ThemeSnapshot {
  return clientSnapshot;
}

function getServerSnapshot(): ThemeSnapshot {
  return SERVER_SNAPSHOT;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((next: ThemeMode) => {
    const resolvedTheme = applyDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors (e.g. private mode)
    }
    commit({ mode: next, resolvedTheme });
  }, []);

  return (
    <ThemeContext.Provider
      value={{ mode: snapshot.mode, resolvedTheme: snapshot.resolvedTheme, setMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
