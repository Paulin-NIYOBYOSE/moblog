"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Edit2,
  Plus,
  Save,
  Settings,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { useBacktestSchedule } from "@/lib/useBacktestSchedule";
import {
  calculateCompletionDays,
  generateSessionId,
} from "@/lib/backtestSchedule";
import { V2_INSTRUMENTS } from "@/lib/backtestV2";
import type { BacktestSession } from "@/lib/backtestSchedule";
import { cn } from "@/lib/utils";

export default function DailyPlanTab() {
  const {
    config,
    loading,
    error,
    updateWeekdaySessions,
    updateWeekendSessions,
    updatePairsPerDay,
  } = useBacktestSchedule();
  const [editingWeekday, setEditingWeekday] = useState(false);
  const [editingWeekend, setEditingWeekend] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<{
    session: BacktestSession;
    type: "weekday" | "weekend";
    index: number;
  } | null>(null);
  const [targetInput, setTargetInput] = useState("");

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-sm text-loss">Failed to load schedule: {error}</p>
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </Card>
    );
  }

  const completionDays = calculateCompletionDays(config.pairsPerDay);
  const totalPairs = V2_INSTRUMENTS.length * 2;

  const handleAddSession = (type: "weekday" | "weekend") => {
    const newSession: BacktestSession = {
      id: generateSessionId(),
      startTime: "08:00",
      endTime: "10:00",
      pairs: [],
    };

    if (type === "weekday") {
      setEditingWeekday(true);
      void updateWeekdaySessions([...config.weekday.sessions, newSession]);
    } else {
      setEditingWeekend(true);
      void updateWeekendSessions([...config.weekend.sessions, newSession]);
    }
  };

  const handleDeleteSession = async (
    type: "weekday" | "weekend",
    index: number,
  ) => {
    if (type === "weekday") {
      const sessions = config.weekday.sessions.filter((_, i) => i !== index);
      if (sessions.length === 0) {
        alert("You must have at least one weekday session");
        return;
      }
      await updateWeekdaySessions(sessions);
    } else {
      const sessions = config.weekend.sessions.filter((_, i) => i !== index);
      if (sessions.length === 0) {
        alert("You must have at least one weekend session");
        return;
      }
      await updateWeekendSessions(sessions);
    }
  };

  const handleMoveSession = async (
    type: "weekday" | "weekend",
    index: number,
    direction: "up" | "down",
  ) => {
    const sessions =
      type === "weekday"
        ? [...config.weekday.sessions]
        : [...config.weekend.sessions];
    const newIndex = direction === "up" ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= sessions.length) return;

    [sessions[index], sessions[newIndex]] = [
      sessions[newIndex],
      sessions[index],
    ];

    if (type === "weekday") {
      await updateWeekdaySessions(sessions);
    } else {
      await updateWeekendSessions(sessions);
    }
  };

  const handleUpdateTarget = async () => {
    const newTarget = parseInt(targetInput);
    if (isNaN(newTarget) || newTarget < 1) {
      alert("Please enter a valid number (at least 1)");
      return;
    }
    await updatePairsPerDay(newTarget);
    setEditingTarget(false);
  };

  return (
    <div className="space-y-5">
      <Card
        padding="lg"
        className="bg-gradient-to-br from-accent-soft/30 to-transparent"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold">
                Backtesting Schedule Planner
              </h3>
              <p className="mt-1 text-sm text-muted">
                Customize your daily backtesting sessions to complete{" "}
                {totalPairs} pair-years by Nov 30, 2026
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Daily Target Card */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <div>
            <CardHeader
              icon={Clock}
              tone="gold"
              title={`Daily Target: ${config.pairsPerDay} pair-year${config.pairsPerDay > 1 ? "s" : ""}`}
              subtitle={`Complete all ${totalPairs} in ${completionDays} days · finish by Nov ${completionDays <= 30 ? completionDays : "30+"}`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setTargetInput(String(config.pairsPerDay));
              setEditingTarget(true);
            }}
            className="btn btn-secondary btn-sm"
          >
            <Edit2 className="h-3.5 w-3.5" /> Adjust
          </button>
        </div>
      </Card>

      {/* Schedule Columns */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ScheduleColumn
          title="Weekday Schedule"
          subtitle="Monday – Friday"
          sessions={config.weekday.sessions}
          isEditing={editingWeekday}
          onToggleEdit={() => setEditingWeekday(!editingWeekday)}
          onAddSession={() => handleAddSession("weekday")}
          onDeleteSession={(index) => handleDeleteSession("weekday", index)}
          onMoveSession={(index, direction) =>
            handleMoveSession("weekday", index, direction)
          }
          onEditSession={(session, index) =>
            setSessionToEdit({ session, type: "weekday", index })
          }
          icon={Sun}
        />
        <ScheduleColumn
          title="Weekend Schedule"
          subtitle="Saturday & Sunday"
          sessions={config.weekend.sessions}
          isEditing={editingWeekend}
          onToggleEdit={() => setEditingWeekend(!editingWeekend)}
          onAddSession={() => handleAddSession("weekend")}
          onDeleteSession={(index) => handleDeleteSession("weekend", index)}
          onMoveSession={(index, direction) =>
            handleMoveSession("weekend", index, direction)
          }
          onEditSession={(session, index) =>
            setSessionToEdit({ session, type: "weekend", index })
          }
          icon={Coffee}
        />
      </div>

      {/* Tips Card */}
      <Card padding="lg">
        <CardHeader
          icon={Settings}
          tone="muted"
          title="Tips for staying on track"
          subtitle="Consistency is key to completing your backtesting goal"
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
              Visit the Backtesting v2 page to track progress and mark
              pair-years complete as you go.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-sm font-semibold">🔄 Adjust as needed</div>
            <p className="mt-1 text-xs text-muted">
              Your schedule is flexible—change times, add sessions, or adjust
              your daily target anytime.
            </p>
          </div>
        </div>
      </Card>

      {/* Edit Session Modal */}
      {sessionToEdit && (
        <SessionEditModal
          session={sessionToEdit.session}
          type={sessionToEdit.type}
          onClose={() => setSessionToEdit(null)}
          onSave={async (updated) => {
            const sessions =
              sessionToEdit.type === "weekday"
                ? [...config.weekday.sessions]
                : [...config.weekend.sessions];
            sessions[sessionToEdit.index] = updated;

            if (sessionToEdit.type === "weekday") {
              await updateWeekdaySessions(sessions);
            } else {
              await updateWeekendSessions(sessions);
            }
            setSessionToEdit(null);
          }}
        />
      )}

      {/* Edit Target Modal */}
      <Modal
        open={editingTarget}
        onClose={() => setEditingTarget(false)}
        size="sm"
        icon={Clock}
        title="Adjust Daily Target"
        subtitle="Change how many pair-years you want to complete per day"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Pair-years per day
            </label>
            <input
              type="number"
              min="1"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="input"
              placeholder="e.g., 2"
            />
            <p className="mt-2 text-xs text-muted">
              At {targetInput || config.pairsPerDay} per day, you'll complete
              all {totalPairs} in{" "}
              {calculateCompletionDays(
                parseInt(targetInput) || config.pairsPerDay,
              )}{" "}
              days
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpdateTarget}
              className="btn btn-primary flex-1"
            >
              <Check className="h-4 w-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => setEditingTarget(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ScheduleColumn({
  title,
  subtitle,
  sessions,
  isEditing,
  onToggleEdit,
  onAddSession,
  onDeleteSession,
  onMoveSession,
  onEditSession,
  icon: HeaderIcon,
}: {
  title: string;
  subtitle: string;
  sessions: BacktestSession[];
  isEditing: boolean;
  onToggleEdit: () => void;
  onAddSession: () => void;
  onDeleteSession: (index: number) => void;
  onMoveSession: (index: number, direction: "up" | "down") => void;
  onEditSession: (session: BacktestSession, index: number) => void;
  icon: React.ElementType;
}) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <CardHeader icon={HeaderIcon} title={title} subtitle={subtitle} />
        <button
          type="button"
          onClick={onToggleEdit}
          className={cn(
            "btn btn-sm",
            isEditing ? "btn-primary" : "btn-secondary",
          )}
        >
          {isEditing ? (
            <>
              <Check className="h-3.5 w-3.5" /> Done
            </>
          ) : (
            <>
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </>
          )}
        </button>
      </div>

      <div className="space-y-2">
        {sessions.map((session, index) => (
          <div
            key={session.id}
            className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3"
          >
            {isEditing && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onMoveSession(index, "up")}
                  disabled={index === 0}
                  className="flex h-5 w-5 items-center justify-center rounded bg-card text-muted hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSession(index, "down")}
                  disabled={index === sessions.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded bg-card text-muted hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
              <CalendarDays className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold tabular-nums text-accent">
                  {session.startTime} – {session.endTime}
                </span>
                <Badge tone="accent" className="text-[10px]">
                  Session {index + 1}
                </Badge>
              </div>
              <div className="mt-0.5 text-sm font-medium text-accent-emphasis">
                {session.pairs.length > 0
                  ? `${session.pairs.length} pair${session.pairs.length > 1 ? "s" : ""}: ${session.pairs.slice(0, 3).join(", ")}${session.pairs.length > 3 ? "..." : ""}`
                  : "No pairs assigned"}
              </div>
            </div>

            {isEditing && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onEditSession(session, index)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-accent hover:bg-accent hover:text-white"
                  title="Edit session"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(index)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-loss hover:bg-loss hover:text-white"
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isEditing && (
        <button
          type="button"
          onClick={onAddSession}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 py-3 text-sm font-medium text-muted hover:border-accent hover:text-accent"
        >
          <Plus className="h-4 w-4" /> Add session
        </button>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold text-foreground">
              {sessions.length} session{sessions.length > 1 ? "s" : ""}
            </span>{" "}
            configured
          </span>
        </div>
      </div>
    </Card>
  );
}

function SessionEditModal({
  session,
  type,
  onClose,
  onSave,
}: {
  session: BacktestSession;
  type: "weekday" | "weekend";
  onClose: () => void;
  onSave: (session: BacktestSession) => Promise<void>;
}) {
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime);
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(
    new Set(session.pairs),
  );
  const [saving, setSaving] = useState(false);

  const togglePair = (pair: string) => {
    const newSet = new Set(selectedPairs);
    if (newSet.has(pair)) {
      newSet.delete(pair);
    } else {
      newSet.add(pair);
    }
    setSelectedPairs(newSet);
  };

  const handleSave = async () => {
    if (startTime >= endTime) {
      alert("End time must be after start time");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...session,
        startTime,
        endTime,
        pairs: Array.from(selectedPairs),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="lg"
      icon={CalendarDays}
      title="Edit Backtesting Session"
      subtitle={`Configure time and pairs for this ${type} session`}
    >
      <div className="space-y-5">
        {/* Time Selection */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Pair Selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Currency Pairs ({selectedPairs.size} selected)
          </label>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {V2_INSTRUMENTS.map((pair) => {
                const isSelected = selectedPairs.has(pair);
                return (
                  <button
                    key={pair}
                    type="button"
                    onClick={() => togglePair(pair)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                      isSelected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-card hover:border-border-strong",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded",
                        isSelected
                          ? "bg-accent text-white"
                          : "border-2 border-border-strong",
                      )}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      )}
                    </div>
                    {pair}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Select which currency pairs you want to backtest in this session
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? (
              "Saving..."
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Session
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn btn-secondary"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
