"use client";

import { useState, useMemo } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Grip,
  MoreVertical,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { cn, todayKey } from "@/lib/utils";

interface DailyTask {
  id: string;
  text: string;
  completed: boolean;
  timeBlock?: string; // e.g., "09:00-10:00"
  priority?: "high" | "medium" | "low";
}

interface DailyNote {
  id: string;
  text: string;
  timestamp: number;
}

interface DailyPlan {
  date: string;
  tasks: DailyTask[];
  notes: DailyNote[];
  focus?: string; // Main focus/goal for the day
}

// Load/save from localStorage for now (can be moved to API later)
function loadDailyPlan(date: string): DailyPlan {
  if (typeof window === "undefined") return { date, tasks: [], notes: [] };
  const stored = localStorage.getItem(`dailyPlan:${date}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return { date, tasks: [], notes: [] };
    }
  }
  return { date, tasks: [], notes: [] };
}

function saveDailyPlan(plan: DailyPlan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`dailyPlan:${plan.date}`, JSON.stringify(plan));
}

export default function DailyPlanTab() {
  const [today] = useState(todayKey());
  const [selectedDate, setSelectedDate] = useState(today);
  const [plan, setPlan] = useState<DailyPlan>(() => loadDailyPlan(today));
  const [newTaskText, setNewTaskText] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusInput, setFocusInput] = useState("");
  const [editingTask, setEditingTask] = useState<{
    id: string;
    text: string;
  } | null>(null);

  const updatePlan = (updates: Partial<DailyPlan>) => {
    const updated = { ...plan, ...updates };
    setPlan(updated);
    saveDailyPlan(updated);
  };

  const isToday = selectedDate === today;

  // Task management
  const addTask = () => {
    if (!newTaskText.trim()) return;
    const newTask: DailyTask = {
      id: `task_${Date.now()}`,
      text: newTaskText.trim(),
      completed: false,
      priority: "medium",
    };
    updatePlan({ tasks: [...plan.tasks, newTask] });
    setNewTaskText("");
  };

  const toggleTask = (taskId: string) => {
    updatePlan({
      tasks: plan.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t,
      ),
    });
  };

  const deleteTask = (taskId: string) => {
    updatePlan({ tasks: plan.tasks.filter((t) => t.id !== taskId) });
  };

  const updateTaskText = (taskId: string, text: string) => {
    updatePlan({
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, text } : t)),
    });
  };

  const updateTaskPriority = (
    taskId: string,
    priority: DailyTask["priority"],
  ) => {
    updatePlan({
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, priority } : t)),
    });
  };

  const updateTaskTimeBlock = (taskId: string, timeBlock?: string) => {
    updatePlan({
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, timeBlock } : t)),
    });
  };

  // Note management
  const addNote = () => {
    if (!newNoteText.trim()) return;
    const newNote: DailyNote = {
      id: `note_${Date.now()}`,
      text: newNoteText.trim(),
      timestamp: Date.now(),
    };
    updatePlan({ notes: [...plan.notes, newNote] });
    setNewNoteText("");
  };

  const deleteNote = (noteId: string) => {
    updatePlan({ notes: plan.notes.filter((n) => n.id !== noteId) });
  };

  // Focus management
  const updateFocus = () => {
    updatePlan({ focus: focusInput.trim() || undefined });
    setEditingFocus(false);
  };

  // Stats
  const stats = useMemo(() => {
    const total = plan.tasks.length;
    const completed = plan.tasks.filter((t) => t.completed).length;
    const highPriority = plan.tasks.filter(
      (t) => t.priority === "high" && !t.completed,
    ).length;
    return { total, completed, remaining: total - completed, highPriority };
  }, [plan.tasks]);

  // Date navigation
  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const newDate = current.toISOString().split("T")[0];
    setSelectedDate(newDate);
    setPlan(loadDailyPlan(newDate));
  };

  const goToToday = () => {
    setSelectedDate(today);
    setPlan(loadDailyPlan(today));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-5">
      {/* Date Navigation */}
      <Card
        padding="lg"
        className="bg-gradient-to-br from-accent-soft/30 to-transparent"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => changeDate(-1)}
              className="btn btn-ghost btn-sm"
              title="Previous day"
            >
              ←
            </button>
            <div className="text-center">
              <h3 className="font-display text-xl font-semibold">
                {formatDate(selectedDate)}
              </h3>
              {isToday && (
                <Badge tone="accent" className="mt-1">
                  Today
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => changeDate(1)}
              className="btn btn-ghost btn-sm"
              title="Next day"
            >
              →
            </button>
          </div>
          {!isToday && (
            <button
              type="button"
              onClick={goToToday}
              className="btn btn-secondary btn-sm"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Today
            </button>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card padding="md" className="text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted">Total tasks</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-2xl font-bold text-profit">
            {stats.completed}
          </div>
          <div className="text-xs text-muted">Completed</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-2xl font-bold text-accent">
            {stats.remaining}
          </div>
          <div className="text-xs text-muted">Remaining</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-2xl font-bold text-loss">
            {stats.highPriority}
          </div>
          <div className="text-xs text-muted">High priority</div>
        </Card>
      </div>

      {/* Main Focus */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <CardHeader
            icon={Clock}
            tone="gold"
            title="Today's Main Focus"
            subtitle="What's the one thing you want to accomplish today?"
          />
          <button
            type="button"
            onClick={() => {
              setFocusInput(plan.focus || "");
              setEditingFocus(true);
            }}
            className="btn btn-ghost btn-sm"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {plan.focus ? (
          <div className="rounded-xl border border-accent/30 bg-accent-soft p-4">
            <p className="text-lg font-medium text-accent-emphasis">
              {plan.focus}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border bg-surface-2/60 p-4 text-center text-sm text-muted">
            No focus set for this day. Click the edit button to add one.
          </div>
        )}
      </Card>

      {/* Tasks Section */}
      <Card padding="lg">
        <CardHeader
          icon={CheckCircle2}
          title="Tasks"
          subtitle={`${stats.completed} of ${stats.total} completed`}
        />

        {/* Add new task */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a new task..."
            className="input flex-1"
          />
          <button
            type="button"
            onClick={addTask}
            className="btn btn-primary"
            disabled={!newTaskText.trim()}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {/* Task list */}
        <div className="mt-4 space-y-2">
          {plan.tasks.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-surface-2/60 p-6 text-center text-sm text-muted">
              No tasks yet. Add your first task above to get started!
            </div>
          ) : (
            plan.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
                onDelete={() => deleteTask(task.id)}
                onUpdateText={(text) => updateTaskText(task.id, text)}
                onUpdatePriority={(priority) =>
                  updateTaskPriority(task.id, priority)
                }
                onUpdateTimeBlock={(timeBlock) =>
                  updateTaskTimeBlock(task.id, timeBlock)
                }
                editingTask={editingTask}
                setEditingTask={setEditingTask}
              />
            ))
          )}
        </div>
      </Card>

      {/* Notes Section */}
      <Card padding="lg">
        <CardHeader
          icon={StickyNote}
          title="Notes & Reflections"
          subtitle="Quick notes, ideas, and reflections for this day"
        />

        {/* Add new note */}
        <div className="mt-4 flex gap-2">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                addNote();
              }
            }}
            placeholder="Add a note... (Cmd/Ctrl+Enter to save)"
            className="input min-h-[80px] flex-1 resize-y"
          />
          <button
            type="button"
            onClick={addNote}
            className="btn btn-primary self-start"
            disabled={!newNoteText.trim()}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {/* Notes list */}
        <div className="mt-4 space-y-3">
          {plan.notes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-surface-2/60 p-6 text-center text-sm text-muted">
              No notes yet. Add your first note above!
            </div>
          ) : (
            plan.notes
              .slice()
              .reverse()
              .map((note) => (
                <div
                  key={note.id}
                  className="group relative rounded-xl border border-border bg-surface-2 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {note.text}
                      </p>
                      <p className="mt-2 text-xs text-faint">
                        {new Date(note.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-sm text-loss"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>

      {/* Edit Focus Modal */}
      <Modal
        open={editingFocus}
        onClose={() => setEditingFocus(false)}
        size="sm"
        icon={Clock}
        title="Set Your Main Focus"
        subtitle="What's the one thing that matters most today?"
      >
        <div className="space-y-4">
          <textarea
            value={focusInput}
            onChange={(e) => setFocusInput(e.target.value)}
            placeholder="e.g., Complete the client proposal, Study for certification exam..."
            className="input min-h-[100px] resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={updateFocus}
              className="btn btn-primary flex-1"
            >
              <Check className="h-4 w-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => setEditingFocus(false)}
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

function TaskItem({
  task,
  onToggle,
  onDelete,
  onUpdateText,
  onUpdatePriority,
  onUpdateTimeBlock,
  editingTask,
  setEditingTask,
}: {
  task: DailyTask;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateText: (text: string) => void;
  onUpdatePriority: (priority: DailyTask["priority"]) => void;
  onUpdateTimeBlock: (timeBlock?: string) => void;
  editingTask: { id: string; text: string } | null;
  setEditingTask: (task: { id: string; text: string } | null) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState(task.timeBlock || "");

  const isEditing = editingTask?.id === task.id;

  const priorityColors = {
    high: "text-loss border-loss/30 bg-loss-soft",
    medium: "text-accent border-accent/30 bg-accent-soft",
    low: "text-muted border-border bg-surface-2",
  };

  const priorityLabels = {
    high: "High",
    medium: "Med",
    low: "Low",
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-3 transition-colors",
        task.completed
          ? "border-border bg-surface-2/60 opacity-60"
          : "border-border bg-card hover:border-border-strong",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-40 hover:opacity-100"
        title="Drag to reorder"
      >
        <Grip className="h-4 w-4 text-muted" />
      </button>

      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          task.completed
            ? "border-profit bg-profit text-white"
            : "border-border-strong hover:border-accent",
        )}
      >
        {task.completed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={editingTask.text}
              onChange={(e) =>
                setEditingTask({ ...editingTask, text: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdateText(editingTask.text);
                  setEditingTask(null);
                } else if (e.key === "Escape") {
                  setEditingTask(null);
                }
              }}
              onBlur={() => {
                onUpdateText(editingTask.text);
                setEditingTask(null);
              }}
              className="input input-sm flex-1"
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingTask({ id: task.id, text: task.text })}
            className={cn(
              "text-left text-sm font-medium transition-colors hover:text-accent",
              task.completed && "line-through",
            )}
          >
            {task.text}
          </button>
        )}

        {/* Meta info */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge
            tone={
              task.priority === "high"
                ? "loss"
                : task.priority === "medium"
                  ? "accent"
                  : "muted"
            }
            className="text-[10px]"
          >
            {priorityLabels[task.priority || "medium"]}
          </Badge>

          {task.timeBlock && (
            <button
              type="button"
              onClick={() => {
                setTimeInput(task.timeBlock || "");
                setEditingTime(true);
              }}
              className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium hover:border-accent"
            >
              <Clock className="h-2.5 w-2.5" />
              {task.timeBlock}
            </button>
          )}

          {!task.timeBlock && !editingTime && (
            <button
              type="button"
              onClick={() => setEditingTime(true)}
              className="rounded-md border border-dashed border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
            >
              + Time
            </button>
          )}

          {editingTime && (
            <div className="flex gap-1">
              <input
                type="text"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onUpdateTimeBlock(timeInput.trim() || undefined);
                    setEditingTime(false);
                  } else if (e.key === "Escape") {
                    setEditingTime(false);
                  }
                }}
                placeholder="e.g., 9-10am"
                className="input input-sm w-24 text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateTimeBlock(timeInput.trim() || undefined);
                  setEditingTime(false);
                }}
                className="btn btn-ghost btn-sm"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-sm"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-card shadow-xl">
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Priority
                </div>
                {(["high", "medium", "low"] as const).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => {
                      onUpdatePriority(priority);
                      setShowMenu(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                      task.priority === priority && "bg-surface-2 font-medium",
                    )}
                  >
                    <Circle
                      className={cn(
                        "h-2 w-2",
                        priority === "high"
                          ? "fill-loss text-loss"
                          : priority === "medium"
                            ? "fill-accent text-accent"
                            : "fill-muted text-muted",
                      )}
                    />
                    {priorityLabels[priority]} priority
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-loss hover:bg-loss-soft"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete task
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
