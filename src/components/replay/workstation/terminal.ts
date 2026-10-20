import { useEffect } from "react";
import { Poppins } from "next/font/google";

const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/**
 * The workspace's terminal look (tokens + font) lives on <html> while it's
 * mounted, so dialogs and menus rendered outside its subtree match it.
 */
export function useTerminalTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("replay-terminal", poppins.variable);
    return () => root.classList.remove("replay-terminal", poppins.variable);
  }, []);
}

export function readLocal(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, v: number | string) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // storage blocked — the preference just won't persist
  }
}

export function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
