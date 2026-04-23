"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
    const status = (n.metadata as { status?: string } | null)?.status;
    const suffix = status === "rejected" ? "rejected" : "approved";
    return `${n.type}_${suffix}`;
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

  if (name !== undefined) vars.name = name;
  if (challenge !== undefined) vars.challenge = challenge;
  if (checkpoint !== undefined) vars.checkpoint = checkpoint;
  if (badge !== undefined) vars.badge = badge;

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
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(interval);
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
        aria-label={t("ariaLabel")}
        aria-haspopup="true"
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
        <div className={styles.dropdown}>
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
                      {new Date(n.created_at).toLocaleString()}
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
