"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./avatar.module.scss";

type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  /** Picture URL from Nostr metadata. Missing or failing loads fall back
   *  to a colored circle with the first letter of `name`. */
  src?: string | null;
  alt: string;
  /** Name used to derive the fallback initial when `src` is unavailable. */
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
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
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  return (
    <span
      className={cn(styles.avatar, sizeClass[size], className)}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        // Existing call sites render user avatars with plain <img> (behind
        // an eslint-disable for next/image), so this primitive mirrors
        // that choice to avoid triggering the image-domains config.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src ?? undefined}
          alt={alt}
          className={styles.image}
          onError={() => setFailed(true)}
        />
      ) : (
        initialFor(name)
      )}
    </span>
  );
}
