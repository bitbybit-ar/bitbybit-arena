import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./empty-state.module.scss";

interface EmptyStateProps {
  /** Short headline describing the absent content. */
  title: string;
  /** Optional supporting line rendered below the title. */
  description?: string;
  /** Optional decorative icon rendered above the title at ~32px. */
  icon?: ReactNode;
  /** Optional call-to-action slot (typically a <Button>) rendered below
   *  the description. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shared "no results" / "no participants" / "no submissions yet" surface.
 * Migration target for the ad-hoc `.emptyText` paragraphs dotted around
 * Explore, My Challenges and challenge detail.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(styles.root, className)} role="status">
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
