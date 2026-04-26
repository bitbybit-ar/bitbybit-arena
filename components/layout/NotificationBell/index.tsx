"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { BellIcon } from "@/components/icons";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type { Notification } from "@/lib/types";
import styles from "./notification-bell.module.scss";

const POLL_MS = 30_000;

// The DB row stores English fallbacks, but each notification also carries
// `type` + `metadata` so the client can render in the viewer's locale.
// Verified-type notifications flip between _approved / _rejected keys
// based on metadata.status. Everything else is a 1:1 key lookup.
function resolveKey(n: Notification): string {
  if (n.type === "completion_verified" || n.type === "checkpoint_verified") {
    const meta = n.metadata as
      | { status?: string; reject_reason?: unknown }
      | null;
    const status = meta?.status;
    if (status === "rejected") {
      // Pick the *_with_reason key when the creator left a note so the
      // submitter sees "your proof was rejected: <reason>" instead of a
      // generic line. Falls back to the plain rejected key when the
      // metadata has no reason (older rows, auto-rejections).
      const reason =
        typeof meta?.reject_reason === "string" &&
        meta.reject_reason.trim().length > 0;
      return reason ? `${n.type}_rejected_with_reason` : `${n.type}_rejected`;
    }
    return `${n.type}_approved`;
  }
  return n.type;
}

function extractVars(
  metadata: Record<string, unknown> | null
): Record<string, string | number> {
  if (!metadata) return {};
  const vars: Record<string, string | number> = {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  const name = str(metadata.name);
  // The older completion notifications wrote `metadata.challenge` as the
  // title; the newer checkpoint ones use `challenge_title`. Accept either
  // so we don't have to migrate old rows.
  const challenge =
    str(metadata.challenge) ?? str(metadata.challenge_title);
  const checkpoint =
    str(metadata.checkpoint) ?? str(metadata.checkpoint_title);
  const badge = str(metadata.badge);
  const rejectReason = str(metadata.reject_reason);

  if (name !== undefined) vars.name = name;
  if (challenge !== undefined) vars.challenge = challenge;
  if (checkpoint !== undefined) vars.checkpoint = checkpoint;
  if (badge !== undefined) vars.badge = badge;
  if (rejectReason !== undefined) vars.reason = rejectReason;

  return vars;
}

function challengeHref(
  metadata: Record<string, unknown> | null
): string | null {
  const id = metadata && typeof metadata.challenge_id === "string"
    ? metadata.challenge_id
    : null;
  return id ? `/explore/${id}` : null;
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [authenticated, setAuthenticated] = useState(true);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const json = await res.json();
      if (json.success) setNotifications(json.data ?? []);
    } catch {
      // Polling; a transient network error is fine, we retry next tick.
    }
  }, []);

  useEffect(() => {
    // Only schedule the interval when the tab is actually visible.
    // A long-lived background tab used to fire ~2,880 polls per day per
    // user even though the bell isn't on screen — wasted bandwidth on
    // both ends. We pause on `visibilitychange` and resume (with an
    // immediate fetch to catch up on anything that landed while we
    // were away) when the tab comes back.
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      // Catch-up fetch on resume so the user doesn't have to wait
      // a full 30s for the first refresh.
      fetchNotifications();
      interval = setInterval(fetchNotifications, POLL_MS);
    };

    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchNotifications]);

  useClickOutside(wrapperRef, () => setOpen(false), open);

  const markAsRead = async (id: string) => {
    // Optimistic: flip locally first so the dropdown doesn't flicker.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // If the PATCH fails the next poll will resync the real state.
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      // Same resync story as above.
    }
  };

  if (!authenticated) return null;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={() => setOpen((v) => !v)}
        // `aria-haspopup="dialog"` matches what we render — a labeled
        // panel with a list of notifications, not a WAI-ARIA `menu`
        // pattern with arrow-key navigation. Screen readers now
        // announce "popup dialog" instead of "menu" when focusing the
        // bell, which sets the right keyboard expectation (Esc closes,
        // Tab moves linearly through items).
        aria-label={t("ariaLabel")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={styles.dropdown}
          role="dialog"
          aria-label={t("ariaLabel")}
        >
          <div className={styles.header}>
            <span className={styles.count}>{t("unreadCount", { count: unreadCount })}</span>
            {unreadCount > 0 && (
              <button type="button" className={styles.markAll} onClick={markAllRead}>
                {t("markAllRead")}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className={styles.empty}>{t("empty")}</p>
          ) : (
            <ul className={styles.list}>
              {notifications.map((n) => {
                const key = resolveKey(n);
                const vars = extractVars(n.metadata);
                // Fall back to the server-written English strings if the
                // translation key is missing (keeps the bell useful even
                // if a new type is rolled out before i18n catches up).
                let title: string;
                let body: string;
                try {
                  title = t(`types.${key}.title`);
                } catch {
                  title = n.title;
                }
                try {
                  body = t(`types.${key}.body`, vars);
                } catch {
                  body = n.body ?? "";
                }

                const href = challengeHref(n.metadata);
                const itemClass = `${styles.itemButton} ${n.read ? styles.read : styles.unread}`;
                const onActivate = () => {
                  if (!n.read) markAsRead(n.id);
                  setOpen(false);
                };
                const content = (
                  <>
                    <strong className={styles.title}>{title}</strong>
                    {body && <p className={styles.body}>{body}</p>}
                    <time className={styles.time} dateTime={n.created_at}>
                      {new Date(n.created_at).toLocaleString(locale)}
                    </time>
                  </>
                );

                return (
                  <li key={n.id} className={styles.item}>
                    {href ? (
                      <Link
                        href={href}
                        className={itemClass}
                        onClick={onActivate}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={itemClass}
                        onClick={onActivate}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
