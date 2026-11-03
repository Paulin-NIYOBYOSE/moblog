"use client";

import { CalendarDays, Clock, Coffee, Moon, Sun, Sunset } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface TimeBlock {
  time: string;
  activity: string;
  icon: React.ElementType;
  tone?: "accent" | "profit" | "gold" | "muted";
}

const WEEKDAY_SCHEDULE: TimeBlock[] = [
  { time: "06:00", activity: "Wake up & morning routine", icon: Sun },
  { time: "07:00", activity: "Backtest session #1 — first pair-year", icon: CalendarDays, tone: "accent" },
  { time: "09:00", activity: "Work / main activities", icon: Coffee },
  { time: "12:00", activity: "Lunch break", icon: Coffee },
  { time: "13:00", activity: "Work / main activities (continued)", icon: Coffee },
  { time: "17:00", activity: "Evening routine / free time", icon: Sunset },
  { time: "19:00", activity: "Backtest session #2 — second pair-year", icon: CalendarDays, tone: "accent" },
  { time: "21:00", activity: "Wind down & review notes", icon: Moon },
  { time: "22:00", activity: "Sleep", icon: Moon, tone: "muted" },
];

const WEEKEND_SCHEDULE: TimeBlock[] = [
  { time: "08:00", activity: "Wake up (relaxed start)", icon: Sun },
  { time: "09:00", activity: "Backtest session #1 — first pair-year", icon: CalendarDays, tone: "accent" },
  { time: "11:00", activity: "Break & personal time", icon: Coffee },
  { time: "13:00", activity: "Lunch", icon: Coffee },
  { time: "14:00", activity: "Backtest session #2 — second pair-year", icon: CalendarDays, tone: "accent" },
  { time: "16:00", activity: "Free time / hobbies / social", icon: Sunset },
  { time: "19:00", activity: "Dinner & evening activities", icon: Moon },
  { time: "22:00", activity: "Sleep", icon: Moon, tone: "muted" },
];

function ScheduleColumn({
  title,
  subtitle,
  schedule,
  icon: HeaderIcon,
}: {
  title: string;
  subtitle: string;
  schedule: TimeBlock[];
  icon: React.ElementType;
}) {
  return (
    <Card padding="lg">
      <CardHeader
        icon={HeaderIcon}
        title={title}
        subtitle={subtitle}
      />
      <div className="mt-5 space-y-2">
        {schedule.map((block, i) => {
          const Icon = block.icon;
          const isBacktest = block.activity.toLowerCase().includes("backtest");
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                isBacktest
                  ? "border-accent/30 bg-accent-soft"
                  : block.tone === "muted"
                  ? "border-border bg-surface-2/50"
                  : "border-border bg-surface-2"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isBacktest
                    ? "bg-accent text-white"
                    : block.tone === "gold"
                    ? "bg-gold-soft text-gold"
                    : block.tone === "profit"
                    ? "bg-profit-soft text-profit"
                    : "bg-card text-muted"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold tabular-nums text-muted">
                    {block.time}
                  </span>
                  {isBacktest && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Focus
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-sm font-medium",
                    isBacktest && "text-accent-emphasis"
                  )}
                >
                  {block.activity}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold text-foreground">2 sessions</span> per
            day to complete 56 pair-years by Nov 30
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function V2DailyPlan() {
  return (
    <div className="space-y-5">
      <Card padding="lg" className="bg-gradient-to-br from-accent-soft/30 to-transparent">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold">
              Daily Schedule Overview
            </h3>
            <p className="mt-1 text-sm text-muted">
              To complete 56 pair-years in 30 days (Nov 1–30), you'll backtest 2
              pair-years per day. Below are suggested schedules for weekdays and
              weekends—adjust to fit your routine.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <ScheduleColumn
          title="Weekday Schedule"
          subtitle="Monday – Friday · 2 backtesting sessions"
          schedule={WEEKDAY_SCHEDULE}
          icon={Sun}
        />
        <ScheduleColumn
          title="Weekend Schedule"
          subtitle="Saturday & Sunday · 2 backtesting sessions"
          schedule={WEEKEND_SCHEDULE}
          icon={Coffee}
        />
      </div>

      <Card padding="lg">
        <CardHeader
          icon={Clock}
          tone="gold"
          title="Tips for staying on track"
          subtitle="Consistency is key to completing the 56 pair-years on time"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-sm font-semibold">📅 Block your time</div>
            <p className="mt-1 text-xs text-muted">
              Add backtesting sessions to your calendar as non-negotiable
              appointments with yourself.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-sm font-semibold">⏰ Same time daily</div>
            <p className="mt-1 text-xs text-muted">
              Build the habit by backtesting at consistent times—morning and
              evening work well for most.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-sm font-semibold">✅ Mark as done</div>
            <p className="mt-1 text-xs text-muted">
              Check off each pair-year immediately after completion to maintain
              momentum and track progress.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-sm font-semibold">📝 Take brief notes</div>
            <p className="mt-1 text-xs text-muted">
              Jot down key observations right away while patterns are fresh in
              your mind.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
