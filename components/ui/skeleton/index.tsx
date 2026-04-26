import { cn } from "@/lib/utils";
import styles from "./skeleton.module.scss";

interface SkeletonProps {
  /** Tailwind-ish width override; accepts any CSS length. */
  width?: string | number;
  /** Tailwind-ish height override; accepts any CSS length. */
  height?: string | number;
  /** Render as a circle (avatars). Defaults to a rounded rect. */
  circle?: boolean;
  className?: string;
  /**
   * Localized accessible label for the loading region. Pass via the
   * Suspense fallback that owns the page so screen readers announce
   * "Loading challenges" / "Loading profile" instead of nothing. Leave
   * undefined for nested skeletons inside a labeled wrapper.
   */
  ariaLabel?: string;
}

// Content-shaped placeholder used inside Suspense / loading.tsx
// fallbacks. Pulses via the global skeleton keyframe defined in this
// module's stylesheet. Doesn't carry layout opinions — callers compose
// rectangles to match the real content's footprint, which keeps CLS
// near zero when the real data hydrates.
//
// The wrapper that owns the loading region (usually <SkeletonGroup>)
// is the one that announces "Loading X…" to screen readers. Individual
// skeleton rectangles inside that group stay silent and are hidden
// from assistive tech via aria-hidden, otherwise SR users would hear
// a "busy" beacon for every shape on the page.
export function Skeleton({
  width,
  height,
  circle = false,
  className,
  ariaLabel,
}: SkeletonProps) {
  const labeled = !!ariaLabel;
  return (
    <div
      className={cn(styles.skeleton, circle && styles.circle, className)}
      style={{ width, height }}
      role={labeled ? "status" : undefined}
      aria-label={ariaLabel}
      aria-live={labeled ? "polite" : undefined}
      aria-busy={labeled ? true : undefined}
      aria-hidden={labeled ? undefined : true}
    />
  );
}

interface SkeletonGroupProps {
  children: React.ReactNode;
  /** Localized "Loading X…" string for the whole group. */
  ariaLabel: string;
  className?: string;
}

// Wrap a cluster of <Skeleton/> shapes so screen readers get one
// consolidated "Loading <area>" announcement instead of one per
// rectangle. Nested Skeletons inside should leave ariaLabel undefined.
export function SkeletonGroup({ children, ariaLabel, className }: SkeletonGroupProps) {
  return (
    <div
      className={className}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-busy="true"
    >
      {children}
    </div>
  );
}
