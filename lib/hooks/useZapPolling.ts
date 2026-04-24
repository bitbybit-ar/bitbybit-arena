"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_POLL_INTERVAL_MS = 4000;

interface UseZapPollingOptions {
  /** bolt11 invoice to poll. `null` / `undefined` disables polling. */
  invoice: string | null | undefined;
  /** Called once when the endpoint reports `paid`. Hook itself
   *  guarantees the callback fires at most once per invoice. */
  onSuccess: () => void;
  /** Interval in ms. Defaults to 4000 to match the existing code. */
  intervalMs?: number;
  /** Optional AbortSignal — if the caller wants to bail out
   *  (e.g. user closes the modal). Polling stops when aborted. */
  signal?: AbortSignal;
}

interface UseZapPollingResult {
  /** True while the interval is running for the current invoice. */
  polling: boolean;
  /** Last non-success status string from the endpoint (null before
   *  the first poll). Useful for rendering "waiting…" vs "expired". */
  lastStatus: string | null;
}

/**
 * Polls `/api/zap/status` on a fixed interval until the invoice
 * settles, then fires `onSuccess` exactly once. Used by both the
 * landing-page `ZapModal` and the challenge `FundPotModal` — same
 * endpoint, same cadence, same teardown semantics.
 *
 * Lifecycle:
 * - Polling starts when `invoice` is a non-empty string and stops
 *   when it becomes null/undefined or the caller's `signal` fires.
 * - The first request waits a full `intervalMs` before firing — the
 *   settlement is never instant, so an immediate tick just wastes
 *   a round-trip.
 * - Network errors are swallowed; the next tick retries. The tick
 *   does not surface `fetch` failures to the caller.
 */
export function useZapPolling({
  invoice,
  onSuccess,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  signal,
}: UseZapPollingOptions): UseZapPollingResult {
  // Hold `onSuccess` in a ref so a caller passing an inline arrow
  // function doesn't churn the polling interval on every render.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const [polling, setPolling] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) {
      setPolling(false);
      return;
    }
    if (signal?.aborted) {
      setPolling(false);
      return;
    }

    // Reset last-status when we (re)start for a new invoice so the
    // caller's "waiting/expired" copy doesn't show stale values.
    setLastStatus(null);
    setPolling(true);

    // A poll tick can resolve *after* the caller has unmounted
    // (modal closed, route changed, etc.). Guard every state update
    // and the `onSuccess` callback on this flag so a late-resolving
    // fetch doesn't fire on a disposed component. Today's callers
    // only flip local state — React 19 tolerates that — but a future
    // caller routing onSuccess to navigation would hit the classic
    // setState-after-unmount warning or worse.
    let mounted = true;

    // Fires at most once per invoice — the interval is cleared the
    // moment we call it, and the `fired` guard covers the case
    // where two ticks race before teardown runs.
    let fired = false;
    const fireSuccess = () => {
      if (fired || !mounted) return;
      fired = true;
      clearInterval(timer);
      setPolling(false);
      onSuccessRef.current();
    };

    const tick = async () => {
      try {
        const res = await fetch("/api/zap/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice }),
        });
        if (!mounted) return;
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (!mounted) return;
        if (
          body &&
          typeof body === "object" &&
          "paid" in body &&
          (body as { paid: unknown }).paid === true
        ) {
          fireSuccess();
          return;
        }
        if (
          body &&
          typeof body === "object" &&
          "status" in body &&
          typeof (body as { status: unknown }).status === "string"
        ) {
          setLastStatus((body as { status: string }).status);
        }
      } catch {
        // Silently ignore polling errors — the next interval will retry.
      }
    };

    const timer = setInterval(tick, intervalMs);

    const onAbort = () => {
      clearInterval(timer);
      setPolling(false);
    };
    signal?.addEventListener("abort", onAbort);

    return () => {
      mounted = false;
      clearInterval(timer);
      signal?.removeEventListener("abort", onAbort);
      setPolling(false);
    };
  }, [invoice, intervalMs, signal]);

  return { polling, lastStatus };
}
