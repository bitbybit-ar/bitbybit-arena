"use client";

import { useTranslations } from "next-intl";
import { BoltIcon, CopyIcon } from "@/components/icons";
import { useClipboard } from "@/lib/hooks/useClipboard";
import styles from "./profile.module.scss";

interface ProfileActionsProps {
  /** lud16 / lightning address from the user's kind:0 metadata. Hidden
   *  with the zap button when null. */
  lightningAddress: string | null;
  /** Always-present external link to njump.me with the user's hex
   *  pubkey, so a viewer can verify the Nostr identity outside Arena. */
  njumpUrl: string;
}

// Surface the actions available against this profile: zap (when
// there's a lightning address), open in njump, copy lightning
// address. Kept in its own client component so the parent page can
// stay an async server component (DB read + metadata).
export function ProfileActions({
  lightningAddress,
  njumpUrl,
}: ProfileActionsProps) {
  const t = useTranslations("profile");
  const { copied, copy } = useClipboard();

  // `lightning:` URI is the cross-platform handler scheme — a wallet
  // (Alby on desktop, native handler on mobile) intercepts it and
  // pre-fills the address. When neither is installed the click is a
  // no-op, but the address is also visible alongside with a copy
  // button, so a viewer with a lightning client elsewhere can paste.
  const lightningUri = lightningAddress
    ? `lightning:${lightningAddress}`
    : null;

  // Plain `<a>` instead of the Button component because the targets
  // are external (njump) or a protocol URI (lightning:) — next-intl's
  // Link wrapper inside Button is for locale-aware internal routing
  // and would otherwise rewrite the href.
  return (
    <div className={styles.actions}>
      {lightningAddress && lightningUri && (
        <>
          <a
            href={lightningUri}
            className={styles.zapButton}
            aria-label={t("zapAriaLabel", { address: lightningAddress })}
          >
            <BoltIcon size={14} />
            {t("zapButton")}
          </a>
          <button
            type="button"
            className={styles.lightningChip}
            onClick={() => copy(lightningAddress)}
            aria-label={t("copyLightning", { address: lightningAddress })}
          >
            <span className={styles.lightningChipAddress}>
              ⚡ {lightningAddress}
            </span>
            <CopyIcon size={12} />
            {copied && (
              <span className={styles.lightningChipFeedback} role="status">
                {t("copied")}
              </span>
            )}
          </button>
        </>
      )}
      <a
        href={njumpUrl}
        className={styles.njumpLink}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t("viewOnNjump")}
      </a>
    </div>
  );
}
