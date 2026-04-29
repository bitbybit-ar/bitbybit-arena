"use client";

import { Avatar, type AvatarStatus } from "@/components/common/Avatar";
import { AVATAR_STACK_LIMIT } from "./helpers";
import styles from "./challenge-detail.module.scss";

interface AvatarStackItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  status?: AvatarStatus;
  /** Hex Nostr pubkey of the user this avatar represents. Wired to
   *  the underlying `Avatar` primitive's `pubkey` prop, which makes
   *  the static-avatar branch render as a `<Link>` to
   *  `/profile/<pubkey>`. The button branch (driven by `onItemClick`)
   *  ignores it so click-to-open-modal flows like the General-tab
   *  Completaciones stack stay non-navigable. */
  pubkey?: string | null;
}

interface AvatarStackProps {
  items: AvatarStackItem[];
  moreLabel: (extra: number) => string;
  /** When set, each avatar renders inside a button that fires this
   *  callback with the item id. Used by the General-tab Completaciones
   *  stack to surface the same submission-details modal the Manage
   *  tab uses, so non-creators can also peek at any submission. */
  onItemClick?: (id: string) => void;
}

export function AvatarStack({ items, moreLabel, onItemClick }: AvatarStackProps) {
  const visible = items.slice(0, AVATAR_STACK_LIMIT);
  const extra = Math.max(0, items.length - visible.length);
  return (
    <div className={styles.avatarStack}>
      {visible.map((item) =>
        onItemClick ? (
          <button
            key={item.id}
            type="button"
            className={styles.avatarStackButton}
            onClick={() => onItemClick(item.id)}
            aria-label={item.name}
          >
            <Avatar
              src={item.avatarUrl}
              name={item.name}
              alt={item.name}
              size="sm"
              status={item.status}
            />
          </button>
        ) : (
          <Avatar
            key={item.id}
            src={item.avatarUrl}
            name={item.name}
            alt={item.name}
            size="sm"
            status={item.status}
            pubkey={item.pubkey ?? null}
          />
        )
      )}
      {extra > 0 && (
        <span className={styles.avatarStackMore}>{moreLabel(extra)}</span>
      )}
    </div>
  );
}
