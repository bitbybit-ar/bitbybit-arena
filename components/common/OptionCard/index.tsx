"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./option-card.module.scss";

interface OptionCardProps {
  title: string;
  description?: string;
  selected: boolean;
  multi?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function OptionCard({
  title,
  description,
  selected,
  multi = false,
  disabled,
  onToggle,
}: OptionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onToggle}
      className={cn(styles.card, selected && styles.selected)}
    >
      <span className={styles.title}>
        <span
          className={cn(
            styles.indicator,
            multi ? styles.indicatorCheck : styles.indicatorRadio
          )}
          aria-hidden="true"
        >
          {selected ? (multi ? "✓" : "●") : ""}
        </span>
        {title}
      </span>
      {description && <span className={styles.description}>{description}</span>}
    </button>
  );
}

interface OptionCardGroupProps {
  children: ReactNode;
  label?: string;
}

export function OptionCardGroup({ children, label }: OptionCardGroupProps) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {children}
    </div>
  );
}
