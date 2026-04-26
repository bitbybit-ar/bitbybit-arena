"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./avatar.module.scss";

type AvatarSize = "sm" | "md" | "lg";
/**
 * Border colour around the avatar. Defaults to "nostr" (the brand
 * purple ring) so every avatar across the app reads as a Nostr
 * identity. Submission/participant statuses override it: green for
 * approved, gold for pending, red for rejected.
 */
export type AvatarStatus = "nostr" | "approved" | "pending" | "rejected";

interface AvatarProps {
  /** Picture URL from Nostr metadata. Missing or failing loads fall back
   *  to a colored circle with the first letter of `name`. */
  src?: string | null;
  alt: string;
  /** Name used to derive the fallback initial when `src` is unavailable. */
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

const statusClass: Record<AvatarStatus, string> = {
  nostr: styles.borderNostr,
  approved: styles.borderApproved,
  pending: styles.borderPending,
  rejected: styles.borderRejected,
};

function initialFor(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function Avatar({
  src,
  alt,
  name,
  size = "md",
  status = "nostr",
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  // Reset the failed flag whenever the caller swaps in a new `src` —
  // without this, once an `onError` fires the primitive stays on the
  // fallback initial forever, even if the parent later points at a
  // valid URL (e.g. the user updates their Nostr profile picture
  // mid-session).
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showImage = !!src && !failed;

  // Decorative `alt=""` callers want the avatar muted from screen readers
  // entirely (e.g. the name appears next to it in a list). We honor that
  // in BOTH branches: when the image is shown, the empty alt does the job;
  // when we fall back to initials, we mark the wrapper aria-hidden so the
  // letter isn't announced as random text. For non-empty `alt`, we always
  // expose the avatar with a meaningful name — the previous code hid the
  // wrapper in the fallback state, which left users with assistive tech
  // unable to identify the user being represented by the initial.
  const decorative = alt === "";
  return (
    <span
      className={cn(styles.avatar, sizeClass[size], statusClass[status], className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative ? true : undefined}
    >
      {showImage ? (
        // Existing call sites render user avatars with plain <img> (behind
        // an eslint-disable for next/image), so this primitive mirrors
        // that choice to avoid triggering the image-domains config.
        // The image itself carries `alt=""` because the wrapper above is
        // already labeled — letting both the wrapper and the inner img
        // announce the name would double-read it on every avatar.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src ?? undefined}
          alt=""
          className={styles.image}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialFor(name)}</span>
      )}
    </span>
  );
}
