"use client";

import { useTranslations } from "next-intl";
import styles from "./extension-upsell.module.scss";

type UpsellVariant = "created" | "nsec";

interface ExtensionUpsellProps {
  /**
   * Which copy set to show:
   * - `created`: post-account-creation ("install for a better experience")
   * - `nsec`: paste-nsec flow ("better yet, use an extension for security
   *   and session continuity")
   */
  variant: UpsellVariant;
}

/**
 * Gold notice block that nudges users toward a NIP-07 browser extension
 * instead of relying on nsec paste. Shown after account creation and
 * inside the nsec sign-in modal.
 */
export function ExtensionUpsell({ variant }: ExtensionUpsellProps) {
  const t = useTranslations("login");
  const prefix = variant === "created" ? "createdExtension" : "nsecExtension";

  return (
    <div className={styles.upsell}>
      <strong>{t(`${prefix}Title` as "createdExtensionTitle")}</strong>
      <p>{t(`${prefix}Body` as "createdExtensionBody")}</p>
      <a
        href="https://nostr-wot.com/download"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        {t("createdExtensionCta")}
      </a>
    </div>
  );
}
