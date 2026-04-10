"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExtensionSignerButton } from "@/components/auth/ExtensionSignerButton";
import { LinkIcon, KeyIcon } from "@/components/icons";
import type { SignerHandle } from "@/lib/nostr/signers";
import type { AuthError } from "@/lib/nostr/auth-errors";
import styles from "./signer-method-buttons.module.scss";

interface SignerMethodButtonsProps {
  /** Fires when any of the three methods produces a ready signer. */
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  /** Fires with a structured error from any of the child flows. */
  onError: (error: AuthError) => void;
  /**
   * When provided, the extension flow enforces that the produced
   * signer's pubkey matches this value (reattach flow).
   */
  expectedPubkey?: string;
  /** Called when the user picks the NIP-46 Nostr Connect option. */
  onSelectNip46: () => void;
  /** Called when the user picks the nsec paste option. */
  onSelectNsec: () => void;
  /** Disables the two picker buttons while the parent is busy. */
  disabled?: boolean;
  /**
   * Play the stagger fade-in when mounted. Useful on first page load
   * (sign-in page). Should stay off inside modals that re-mount the
   * picker on back navigation — otherwise the animation replays every
   * time the user cancels a sub-panel.
   */
  animate?: boolean;
}

/**
 * The three-button signer picker used by both the sign-in page and
 * the signer modal (login + reattach flows). Extension button comes
 * from `ExtensionSignerButton`; the NIP-46 and nsec options live
 * here as plain picker buttons that delegate to the parent.
 */
export function SignerMethodButtons({
  onSigner,
  onError,
  expectedPubkey,
  onSelectNip46,
  onSelectNsec,
  disabled,
  animate = false,
}: SignerMethodButtonsProps) {
  const t = useTranslations("login");

  const wrapperClassName = animate
    ? `${styles.methods} ${styles.animate}`
    : styles.methods;

  return (
    <div className={wrapperClassName}>
      <ExtensionSignerButton
        onSigner={onSigner}
        onError={onError}
        expectedPubkey={expectedPubkey}
      />

      <Button
        type="button"
        variant="primary"
        fullWidth
        className={styles.methodButton}
        onClick={onSelectNip46}
        disabled={disabled}
      >
        <LinkIcon size={20} />
        <div className={styles.methodInfo}>
          <span className={styles.methodName}>{t("connectTitle")}</span>
          <span className={styles.methodDescription}>
            {t("connectDescription")}
          </span>
        </div>
      </Button>

      <Button
        type="button"
        variant="ghost"
        fullWidth
        className={styles.methodButton}
        onClick={onSelectNsec}
        disabled={disabled}
      >
        <KeyIcon size={20} />
        <div className={styles.methodInfo}>
          <span className={styles.methodName}>{t("nsecTitle")}</span>
          <span className={styles.methodDescription}>
            {t("nsecDescription")}
          </span>
        </div>
      </Button>
    </div>
  );
}
