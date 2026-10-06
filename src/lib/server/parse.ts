// Small request-parsing helpers shared by the Journal / Attachment /
// Backtesting v2 API routes.

import { NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toTextOrNull(value: unknown, max = 20000): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

export function toStringArray(value: unknown, maxItems = 50): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = String(v ?? "").trim().slice(0, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function toBoolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

export function toIntInRange(value: unknown, min: number, max: number): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Attachment metadata — never the bytes. */
export const ATTACHMENT_SELECT = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  caption: true,
  createdAt: true,
} as const;
