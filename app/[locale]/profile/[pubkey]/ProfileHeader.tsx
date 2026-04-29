"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BoltIcon, CopyIcon, QrIcon } from "@/components/icons";
import { fetchNostrMetadata } from "@/lib/nostr/metadata";
import { useClipboard } from "@/lib/hooks/useClipboard";
import { ProfileQrModal } from "./ProfileQrModal";
import styles from "./profile.module.scss";

interface ProfileHeaderProps {
  pubkey: string;
  displayName: string | null;
  avatarUrl: string | null;
  about: string | null;
  lightningAddress: string | null;
}

// Header for the public profile page. Layout is avatar-on-the-left
// with an identity column to its right (display name → NIP-05 →
// about), plus a top-right QR icon that opens the pubkey + lightning
// address modal. The NIP-05 isn't stored in our DB; we read it from
// the user's kind:0 metadata client-side so the static page render
// stays cheap and the field updates whenever the user re-publishes
// their profile on Nostr.
export function ProfileHeader({
  pubkey,
  displayName,
  avatarUrl,
  about,
  lightningAddress,
}: ProfileHeaderProps) {
  const t = useTranslations("profile");
  const [nip05, setNip05] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const metadata = await fetchNostrMetadata(pubkey);
      if (cancelled) return;
      const value = metadata?.nip05?.trim();
      // NIP-05 is the only field this header consumes from kind:0;
      // everything else (display name, avatar, lightning address)
      // already rides through the DB row from the Arena sync. We
      // skip empty strings so the on-hover copy affordance only
      // appears when there's something to copy.
      if (value) setNip05(value);
    })();
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  // `lightning:` URI is the cross-platform handler scheme — a wallet
  // (Alby on desktop, native handler on mobile) intercepts it and
  // pre-fills the address. When neither is installed the click is a
  // no-op, but the QR modal also exposes a copyable text fallback.
  const lightningUri = lightningAddress
    ? `lightning:${lightningAddress}`
    : null;

  return (
    <header className={styles.header}>
      <div className={styles.headerTopBar}>
        <button
          type="button"
          className={styles.qrButton}
          onClick={() => setQrOpen(true)}
          aria-label={t("openQrModal")}
        >
          <QrIcon size={18} />
        </button>
      </div>
      <div className={styles.headerRow}>
        <div className={styles.avatarWrapper}>
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt={displayName ?? t("unknownUser")}
              className={styles.avatar}
              width={128}
              height={128}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={styles.avatarPlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.identity}>
          <h1 className={styles.displayName}>
            {displayName ?? t("unknownUser")}
          </h1>
          {nip05 && (
            <div className={styles.nip05Wrapper}>
              <span className={styles.nip05}>{nip05}</span>
              <button
                type="button"
                className={styles.nip05CopyButton}
                onClick={() => copy(nip05)}
                aria-label={t("copyNip05", { value: nip05 })}
              >
                <CopyIcon size={12} />
                {copied && (
                  <span className={styles.nip05Feedback} role="status">
                    {t("copied")}
                  </span>
                )}
              </button>
            </div>
          )}
          {about && <p className={styles.about}>{about}</p>}
          {/* Plain `<a>` instead of the Button component because both
              targets are non-internal — `lightning:` is a protocol URI
              and njump is external — and next-intl's `Link` (which
              Button wraps) is for locale-aware in-app routing. The
              `.ceramicButton*` SCSS rules apply the same elevated
              ceramic finish the rest of the platform's primary /
              outline buttons use. */}
          <div className={styles.actions}>
            {lightningUri && (
              <a
                href={lightningUri}
                className={styles.ceramicButtonPrimary}
                aria-label={t("zapAriaLabel", {
                  address: lightningAddress ?? "",
                })}
              >
                <BoltIcon size={14} />
                {t("zapButton")}
              </a>
            )}
            <a
              href={`https://njump.me/${pubkey}`}
              className={styles.ceramicButtonOutline}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t("viewOnNjump")}
            </a>
          </div>
        </div>
      </div>
      {qrOpen && (
        <ProfileQrModal
          pubkey={pubkey}
          lightningAddress={lightningAddress}
          onClose={() => setQrOpen(false)}
        />
      )}
    </header>
  );
}
