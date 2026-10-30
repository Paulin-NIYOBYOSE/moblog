"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Plus, X } from "lucide-react";
import Card from "@/components/ui/Card";
import { addDays, dayTitle, notesOn, weekOf, weekTitle } from "@/lib/notebook";
import type { NotebookNote } from "@/lib/types";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";
import { PeriodNav } from "./shared";

/** A planner: the week, day by day. Write notes and plans on any day; tick them off when done. */
export default function NotesTab({ nb, today }: { nb: NotebookApi; today: string }) {
  const thisWeek = weekOf(today)[0];
  const [monday, setMonday] = useState(thisWeek);
  const notes = nb.data!.notes;
  return (
    <div className="space-y-4">
      <PeriodNav label={weekTitle(monday)} onPrev={() => setMonday(addDays(monday, -7))} onNext={() => setMonday(addDays(monday, 7))} onNow={() => setMonday(thisWeek)} nowLabel="This week" isNow={monday === thisWeek} />
      <Card padding="none">
        <ol className="divide-y divide-border" data-testid="notes-week">
          {weekOf(monday).map((day) => (
            <DayPage key={day} nb={nb} day={day} today={today} notes={notesOn(notes, day)} />
          ))}
        </ol>
      </Card>
    </div>
  );
}

function DayPage({ nb, day, today, notes }: { nb: NotebookApi; day: string; today: string; notes: NotebookNote[] }) {
  const isToday = day === today;
  // Today's page is always open to write on; other days open with a tap.
  const [writing, setWriting] = useState(isToday);
  const [text, setText] = useState("");

  function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void nb.createNote(day, text.trim());
    setText("");
  }

  return (
    <li className={cn("grid grid-cols-[3.25rem_1fr] gap-3 px-4 py-3 sm:grid-cols-[4.5rem_1fr] sm:px-5", isToday && "bg-accent-soft/30")} data-testid={`notes-day-${day}`}>
      <div className={cn("pt-0.5", day < today && "opacity-60")}>
        <p className={cn("text-[11px] font-semibold uppercase tracking-wide", isToday ? "text-accent" : "text-faint")}>{dayTitle(day, { weekday: "short" })}</p>
        <p className={cn("font-display text-2xl leading-none tabular-nums", isToday && "text-accent")}>{+day.slice(8)}</p>
        {isToday && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Today</p>}
      </div>
      <div className="min-w-0">
        {notes.length > 0 && (
          <ul className="mb-1">
            {notes.map((n) => (
              <NoteLine key={n.id} nb={nb} note={n} />
            ))}
          </ul>
        )}
        {writing ? (
          <form onSubmit={add}>
            <input
              className="input py-1.5 text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => !isToday && !text.trim() && setWriting(false)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                setText("");
                if (!isToday) setWriting(false);
              }}
              placeholder={isToday ? "Write a note or a plan for today…" : "Write a note or a plan…"}
              autoFocus={!isToday}
              maxLength={4000}
              aria-label={`New note for ${dayTitle(day)}`}
              data-testid={`note-input-${day}`}
            />
          </form>
        ) : (
          <button type="button" className="flex items-center gap-1 rounded-lg py-1 text-xs text-faint hover:text-accent" onClick={() => setWriting(true)} data-testid={`note-add-${day}`}>
            <Plus className="h-3.5 w-3.5" /> {notes.length ? "Add" : "Write something"}
          </button>
        )}
      </div>
    </li>
  );
}

/** A line on a day: tick it, tap the text to change it (Enter saves, Esc cancels), × to delete. */
function NoteLine({ nb, note }: { nb: NotebookApi; note: NotebookNote }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  // Closing runs once: Enter / Esc unmount the field, which may blur it too.
  const closed = useRef(false);
  // Still being saved: it has no id to change yet.
  const pending = note.id.startsWith("tmp-");

  function open() {
    closed.current = false;
    setText(note.text);
    setEditing(true);
  }

  function close(keep: boolean) {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    const t = text.trim();
    if (keep && t && t !== note.text) void nb.updateNote(note.id, { text: t });
  }

  return (
    <li className="group flex items-start gap-2.5 py-1" data-testid={`note-${note.text}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={note.done}
        aria-label={`Done: ${note.text}`}
        disabled={pending}
        onClick={() => void nb.updateNote(note.id, { done: !note.done })}
        className={cn("mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40", note.done ? "border-profit bg-profit text-white" : "border-border-strong hover:border-profit")}
      >
        {note.done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </button>
      {editing ? (
        <textarea
          className="input flex-1 resize-none py-1 text-sm"
          value={text}
          rows={Math.min(8, Math.max(text.split("\n").length, Math.ceil(text.length / 60)))}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              close(true);
            } else if (e.key === "Escape") close(false);
          }}
          autoFocus
          maxLength={4000}
          aria-label="Change the note"
        />
      ) : (
        <button type="button" disabled={pending} onClick={open} className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-left text-sm", note.done && "text-muted line-through decoration-profit/50", pending && "opacity-60")}>
          {note.text}
        </button>
      )}
      {!pending && (
        <button
          type="button"
          // Keep the field focused, so this click isn't lost to its blur.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            closed.current = true;
            void nb.deleteNote(note.id);
          }}
          className={cn("mt-px shrink-0 rounded p-0.5 text-faint hover:text-loss", !editing && "hidden group-hover:block")}
          aria-label={`Delete “${note.text}”`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
