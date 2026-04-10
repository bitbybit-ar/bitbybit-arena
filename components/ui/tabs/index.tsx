"use client";

import { cn } from "@/lib/utils";
import styles from "./tabs.module.scss";

export interface TabItem<T extends string = string> {
  /** Stable identifier, also used as the key when changing tabs. */
  value: T;
  /** Visible label. */
  label: React.ReactNode;
}

interface TabsProps<T extends string = string> {
  /**
   * Unique, stable id for this tab group. Tab and panel ids are
   * derived from it so consumers can wire up `aria-labelledby` on
   * the panel via `panelIdFor` / `tabIdFor`.
   */
  id: string;
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  /**
   * Accessible name for the tablist. Required unless the tablist is
   * labelled by a preceding heading via `aria-labelledby`.
   */
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
}

export function tabIdFor(groupId: string, value: string): string {
  return `${groupId}-tab-${value}`;
}

export function panelIdFor(groupId: string, value: string): string {
  return `${groupId}-panel-${value}`;
}

/**
 * Accessible tab bar following the WAI-ARIA tab pattern. Each tab
 * gets `role="tab"` plus `aria-selected`, and the tablist is
 * keyboard navigable via arrow keys / Home / End. Consumers render
 * the panel themselves with `role="tabpanel"` and `id={panelIdFor(id, value)}`
 * so the tab's `aria-controls` resolves correctly.
 */
export function Tabs<T extends string = string>({
  id,
  tabs,
  value,
  onChange,
  ariaLabel,
  ariaLabelledby,
  className,
}: TabsProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabs.findIndex((t) => t.value === value);
    if (currentIndex === -1) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(tabs[(currentIndex + 1) % tabs.length].value);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(tabs[(currentIndex - 1 + tabs.length) % tabs.length].value);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(tabs[0].value);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(tabs[tabs.length - 1].value);
    }
  };

  return (
    <div
      className={cn(styles.tablist, className)}
      role="tablist"
      aria-label={ariaLabelledby ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={tabIdFor(id, tab.value)}
            aria-selected={selected}
            aria-controls={panelIdFor(id, tab.value)}
            tabIndex={selected ? 0 : -1}
            className={cn(styles.tab, selected && styles.tabActive)}
            onClick={() => onChange(tab.value)}
            onKeyDown={handleKeyDown}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
