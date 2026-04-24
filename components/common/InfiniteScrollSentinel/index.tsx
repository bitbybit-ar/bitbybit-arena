"use client";

import { useEffect, useRef } from "react";
import styles from "./infinite-scroll-sentinel.module.scss";

interface InfiniteScrollSentinelProps {
  /** Fired once per time the sentinel enters the viewport while not
   *  disabled. Callers use it to kick off their "load more" request. */
  onVisible: () => void;
  /** Set to true when there's no more data to load or a request is
   *  already in flight — the observer is torn down while disabled. */
  disabled?: boolean;
  /** Root margin for the IntersectionObserver. Defaults to "200px" so
   *  the next page is requested slightly before the user hits the
   *  bottom of the scroll container. */
  rootMargin?: string;
}

/**
 * Thin IntersectionObserver wrapper that replaces the ref + useEffect
 * + observer boilerplate duplicated across Explore and My Challenges
 * for their infinite-scroll "load more" pattern.
 */
export function InfiniteScrollSentinel({
  onVisible,
  disabled = false,
  rootMargin = "200px",
}: InfiniteScrollSentinelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Hold `onVisible` in a ref so a caller passing an inline arrow
  // function doesn't churn the observer on every render.
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onVisibleRef.current();
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, rootMargin]);

  return <div ref={ref} className={styles.sentinel} aria-hidden="true" />;
}
