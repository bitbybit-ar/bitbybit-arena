"use client";

import { type KeyboardEvent, useState } from "react";
import styles from "./tag-input.module.scss";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}

const TAG_RE = /^[a-z0-9-]{1,30}$/;

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function TagInput({
  value,
  onChange,
  placeholder,
  max = 10,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const cleaned = normalize(raw);
    if (!cleaned) return;
    if (!TAG_RE.test(cleaned)) return;
    if (value.includes(cleaned)) {
      setDraft("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, cleaned]);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className={styles.wrapper}>
      {value.map((tag) => (
        <span key={tag} className={styles.chip}>
          {tag}
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => remove(tag)}
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        className={styles.input}
        value={draft}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => draft && commit(draft)}
      />
    </div>
  );
}
