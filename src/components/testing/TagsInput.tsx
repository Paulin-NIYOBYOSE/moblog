"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function TagsInput({
  value,
  onChange,
  placeholder = "Add a tag and press Enter",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div>
      <div className="input flex min-h-[2.5rem] flex-wrap items-center gap-1.5 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent"
          >
            {tag}
            <button type="button" onClick={() => remove(tag)} className="hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}
