"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_POLL_INTERVAL_MS = 4000;
// Cap polling at ~10 minutes (150 ticks × 4s). Lightning invoices
// expire on the order of 5-15 minutes; once the cap is reached we
// stop wasting bandwidth and surface `expired` so the modal can show
// a "regenerate invoice" CTA instead of pretending to still be live.
const DEFAULT_MAX_ATTEMPTS = 150;

interface UseZapPollingOptions {
  /** bolt11 invoice to poll. `null` / `undefined` disables polling. */
  invoice: string | null | undefined;
  /** Called once when the endpoint reports `paid`. Hook itself
   *  guarantees the callback fires at most once per invoice. */
  onSuccess: () => void;
  /** Called once when the cap is reached without a `paid`. Useful for
   *  showing a "regenerate invoice" CTA instead of an infinite spinner. */
  onExpired?: () => void;
  /** Interval in ms. Defaults to 4000 to match the existing code. */
  intervalMs?: number;
  /** Hard cap on poll attempts. Defaults to 150 (~10 min at 4s). */
  maxAttempts?: number;
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
  /** True after the hook gives up (max attempts hit without `paid`). */
  expired: boolean;
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
  onExpired,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  signal,
}: UseZapPollingOptions): UseZapPollingResult {
  // Hold callbacks in refs so a caller passing inline arrows doesn't
  // churn the polling interval on every render.
  const onSuccessRef = useRef(onSuccess);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onExpiredRef.current = onExpired;
  }, [onSuccess, onExpired]);

  const [polling, setPolling] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!invoice) {
      setPolling(false);
      setExpired(false);
      return;
    }
    if (signal?.aborted) {
      setPolling(false);
      return;
    }

    // Reset last-status when we (re)start for a new invoice so the
    // caller's "waiting/expired" copy doesn't show stale values.
    setLastStatus(null);
    setExpired(false);
    setPolling(true);

    // A poll tick can resolve *after* the caller has unmounted
    // (modal closed, route changed, etc.). Guard every state update
    // and the callbacks on this flag so a late-resolving fetch
    // doesn't fire on a disposed component.
    let mounted = true;
    let attempts = 0;

    let fired = false;
    const fireSuccess = () => {
      if (fired || !mounted) return;
      fired = true;
      clearInterval(timer);
      setPolling(false);
      onSuccessRef.current();
    };

    const fireExpired = () => {
      if (fired || !mounted) return;
      fired = true;
      clearInterval(timer);
      setPolling(false);
      setExpired(true);
      onExpiredRef.current?.();
    };

    const tick = async () => {
      // Only count an attempt when we actually fire the request. Tabs
      // hidden by the browser DON'T tick (interval still ticks but the
      // browser may throttle to 1 Hz; this stays defensive).
      attempts += 1;
      try {
        const res = await fetch("/api/zap/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice }),
        });
        if (!mounted) return;
        if (!res.ok) {
          if (attempts >= maxAttempts) fireExpired();
          return;
        }
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
        if (attempts >= maxAttempts) fireExpired();
      } catch {
        // Silently ignore polling errors — the next interval will retry,
        // but a sustained network outage still counts toward the cap so
        // we don't poll forever in the background.
        if (attempts >= maxAttempts) fireExpired();
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
  }, [invoice, intervalMs, maxAttempts, signal]);

  return { polling, lastStatus, expired };
}
