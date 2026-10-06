"use client";

import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="font-display text-[2rem] leading-[1.05] tracking-tight sm:text-[2.4rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
