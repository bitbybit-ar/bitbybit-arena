"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
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
  /** Hex Nostr pubkey of the user the avatar represents. When set the
   *  whole avatar wraps in a `<Link>` to `/profile/<pubkey>` so any
   *  surface that already shows an avatar (rosters, completion cards,
   *  participant popups) becomes a navigable entry into the public
   *  profile page. Decorative callers (`alt=""`) ignore this — the
   *  wrapper stays mute. */
  pubkey?: string | null;
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
  pubkey,
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
  // entirely (e.g. the name appears next to it in a list). The wrapper
  // itself carries no role/label so screen readers don't announce a
  // generic "image" beacon — the labeling lives on the inner element
  // that actually represents the avatar:
  //  - image branch: the <img alt={alt}> announces itself
  //  - fallback branch: a labeled <span role="img" aria-label> wraps
  //    the visible initial so the letter doesn't get spelled out
  // This avoids the role="img" nesting (wrapper + inner img both
  // labeled) that confuses some screen readers.
  const decorative = alt === "";

  const visual = showImage ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src ?? undefined}
      alt={alt}
      className={styles.image}
      onError={() => setFailed(true)}
    />
  ) : decorative ? (
    // Decorative fallback: keep the initial visually but stay silent.
    // The outer wrapper is already aria-hidden, so this span needs
    // no further muting — left as plain text.
    initialFor(name)
  ) : (
    // Labeled fallback: the initial alone reads as a stray letter,
    // so we wrap it as a single role="img" region with the caller's
    // name as its accessible name.
    <span role="img" aria-label={alt}>
      <span aria-hidden="true">{initialFor(name)}</span>
    </span>
  );

  // Render as a navigable link only when caller opts in via `pubkey`.
  // Decorative avatars (alt="") and avatars without a pubkey stay as
  // plain spans — that preserves existing roster/manage-popup callers
  // that wrap the avatar in their own onClick to open a details modal.
  if (pubkey && !decorative) {
    return (
      <Link
        href={`/profile/${pubkey}`}
        className={cn(
          styles.avatar,
          styles.linked,
          sizeClass[size],
          statusClass[status],
          className
        )}
      >
        {visual}
      </Link>
    );
  }

  return (
    <span
      className={cn(styles.avatar, sizeClass[size], statusClass[status], className)}
      aria-hidden={decorative ? true : undefined}
    >
      {visual}
    </span>
  );
}
