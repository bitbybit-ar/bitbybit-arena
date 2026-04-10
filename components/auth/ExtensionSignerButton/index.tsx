"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BoltIcon } from "@/components/icons";
import {
  type SignerHandle,
  makeExtensionSigner,
} from "@/lib/nostr/signers";
import styles from "./extension-signer-button.module.scss";

interface ExtensionSignerButtonProps {
  /** Called with a ready-to-use signer once the user grants access. */
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  /** Called with an i18n error key on failure. */
  onError?: (key: string) => void;
  /**
   * When provided, the produced signer's pubkey must match this value.
   * Used by the re-sign-in flow to ensure the user re-attaches to the
   * same Nostr identity that owns the current session cookie.
   */
  expectedPubkey?: string;
  /** Hide the button entirely when no NIP-07 extension is detected. */
  hideIfUnavailable?: boolean;
  /** Optional secondary visual variant. */
  variant?: "primary" | "secondary";
  className?: string;
}

/**
 * NIP-07 "Sign in with browser extension" button.
 * Produces a SignerHandle; the parent decides what to do with it
 * (login flow posts the NIP-42 challenge, re-attach flow just stores it).
 */
export function ExtensionSignerButton({
  onSigner,
  onError,
  expectedPubkey,
  hideIfUnavailable = false,
  variant = "primary",
  className,
}: ExtensionSignerButtonProps) {
  const t = useTranslations("login");
  const [hasExtension, setHasExtension] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () =>
      setHasExtension(typeof window !== "undefined" && !!window.nostr);
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!hasExtension && hideIfUnavailable) return null;

  const handleClick = async () => {
    if (!window.nostr) {
      onError?.("no_extension");
      return;
    }
    setBusy(true);
    try {
      const pubkey = await window.nostr.getPublicKey();
      if (expectedPubkey && pubkey !== expectedPubkey) {
        onError?.("mismatch");
        return;
      }
      await onSigner(makeExtensionSigner(pubkey));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("rejected") || msg.includes("denied")) {
        onError?.("nostr_signing_rejected");
      } else {
        onError?.("extensionRejected");
      }
    } finally {
      setBusy(false);
    }
  };

  const buttonClasses = [
    styles.button,
    variant === "secondary" ? styles.secondary : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={handleClick}
      disabled={busy || !hasExtension}
    >
      <BoltIcon size={20} />
      <div className={styles.info}>
        <span className={styles.name}>{t("extensionTitle")}</span>
        <span className={styles.description}>{t("extensionDescription")}</span>
      </div>
    </button>
  );
}
