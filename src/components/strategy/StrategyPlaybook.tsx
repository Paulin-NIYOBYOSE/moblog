"use client";

import { Ban, BookMarked, ChevronRight, Crown, ListChecks, Ruler, Scale, Target } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import { CHECKLIST } from "@/lib/strategy";
import { PLAYBOOK } from "@/lib/strategyPlaybook";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<string, string> = {
  profit: "bg-profit",
  loss: "bg-loss",
  muted: "bg-faint",
};

export default function StrategyPlaybook() {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card padding="none" className="overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 260px at 15% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), radial-gradient(500px 220px at 100% 120%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative p-6 sm:p-8">
          <div className="eyebrow flex items-center gap-1.5">
            <BookMarked className="h-3 w-3" /> {PLAYBOOK.tagline}
          </div>
          <h2 className="mt-2 font-display text-5xl tracking-tight sm:text-6xl">{PLAYBOOK.name}</h2>
          <p className="mt-1 text-sm font-medium text-muted">{PLAYBOOK.stack}</p>
          <blockquote className="mt-5 max-w-3xl border-l-2 border-gold pl-4 font-display text-xl italic leading-snug text-foreground/90 sm:text-2xl">
            {PLAYBOOK.coreIdea}
          </blockquote>

          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            {PLAYBOOK.oneLine.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span className="rounded-full border border-border bg-card/80 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur">{step}</span>
                {i < PLAYBOOK.oneLine.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-faint" />}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* Timeframes */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PLAYBOOK.timeframes.map((tf, i) => (
          <Card key={tf.tf} padding="md" className="relative overflow-hidden">
            <span className="absolute right-4 top-3 font-display text-5xl leading-none text-foreground/[0.06]">{i + 1}</span>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">{tf.tf}</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">{tf.purpose}</div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{tf.identify}</p>
            <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-semibold">
              <Target className="h-3 w-3 text-accent" /> {tf.decision}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Rules */}
        <div className="space-y-5 xl:col-span-2">
          {PLAYBOOK.sections.map((s) => (
            <Card key={s.n} padding="lg">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent">{s.n}</span>
                <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
              </div>
              <div className={cn("grid gap-4", s.blocks.length > 1 && "md:grid-cols-2")}>
                {s.blocks.map((b) => (
                  <div key={b.title} className="rounded-xl border border-border bg-surface-2/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <span className={cn("h-2 w-2 rounded-full", TONE_DOT[b.tone])} />
                      {b.title}
                    </div>
                    {"ordered" in b && b.ordered ? (
                      <ol className="space-y-1.5">
                        {b.items.map((item, i) => (
                          <li key={item} className="flex gap-2 text-[13px] leading-snug">
                            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded bg-card text-[10px] font-bold text-muted">{i + 1}</span>
                            {item}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="space-y-1.5">
                        {b.items.map((item) => (
                          <li key={item} className="flex gap-2 text-[13px] leading-snug">
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {"footer" in b && b.footer && <p className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted">{b.footer}</p>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card padding="lg" className="xl:sticky xl:top-6">
            <CardHeader icon={ListChecks} tone="gold" title="A+ setup checklist" subtitle="Tick these in each journal entry — the grade is automatic" />
            <ul className="space-y-2">
              {CHECKLIST.map((c, i) => (
                <li key={c.key} className="flex items-start gap-2.5 text-[13px]">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border-strong text-[10px] font-bold text-muted">{i + 1}</span>
                  {c.label}
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-[11px]">
              {[
                { g: "A+", r: "13/13", cls: "bg-gold-soft text-gold" },
                { g: "A", r: "11–12", cls: "bg-accent-soft text-accent" },
                { g: "B", r: "8–10", cls: "bg-info-soft text-info" },
                { g: "C", r: "< 8", cls: "bg-surface-3 text-muted" },
              ].map((x) => (
                <div key={x.g} className={cn("rounded-lg py-1.5", x.cls)}>
                  <div className="text-sm font-bold">{x.g}</div>
                  <div className="opacity-80">{x.r}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="lg">
            <CardHeader icon={Ban} tone="loss" title="No-trade conditions" />
            <ul className="space-y-1.5">
              {PLAYBOOK.noTrade.map((n) => (
                <li key={n} className="flex gap-2 text-[13px] leading-snug">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-loss" />
                  {n}
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="lg">
            <CardHeader icon={Scale} title="Master entry conditions" />
            <div className="space-y-3 text-[13px] leading-relaxed">
              <div className="rounded-xl border border-profit/25 bg-profit-soft p-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-profit">Long</div>
                {PLAYBOOK.master.long}
              </div>
              <div className="rounded-xl border border-loss/25 bg-loss-soft p-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-loss">Short</div>
                {PLAYBOOK.master.short}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <CardHeader icon={Crown} tone="gold" title="Golden rules" />
            <ol className="space-y-2">
              {PLAYBOOK.golden.map((g, i) => (
                <li key={g} className="flex gap-3 text-[13px]">
                  <span className="font-display text-lg leading-none text-gold">{i + 1}</span>
                  {g}
                </li>
              ))}
            </ol>
          </Card>

          <Card padding="lg">
            <CardHeader icon={Ruler} title="Protocol & metrics" />
            <div className="space-y-1.5">
              {PLAYBOOK.protocol.map((p) => (
                <div key={p.code} className="flex items-center gap-2 text-[13px]">
                  <span className="w-10 shrink-0 rounded bg-surface-3 py-0.5 text-center text-[10px] font-bold text-muted">{p.code}</span>
                  {p.change}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PLAYBOOK.metrics.map((m) => (
                <span key={m} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted">
                  {m}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
