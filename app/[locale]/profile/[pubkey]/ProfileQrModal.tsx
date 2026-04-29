"use client";

import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";
import { CopyIcon } from "@/components/icons";
import { useClipboard } from "@/lib/hooks/useClipboard";
import styles from "./profile.module.scss";

interface ProfileQrModalProps {
  pubkey: string;
  lightningAddress: string | null;
  onClose: () => void;
}

// Two-section QR modal opened from the QR icon in the profile
// header. Each section shows a scannable QR plus the underlying
// text (truncated for display, copied verbatim) so a viewer can
// either point a phone at the QR or grab the raw value with one
// click. The pubkey section is always present; the lightning section
// only renders when the user has an address on file.
export function ProfileQrModal({
  pubkey,
  lightningAddress,
  onClose,
}: ProfileQrModalProps) {
  const t = useTranslations("profile");
  const pubkeyClipboard = useClipboard();
  const lightningClipboard = useClipboard();

  return (
    <Modal title={t("qrModalTitle")} onClose={onClose} size="md">
      <div className={styles.qrModalBody}>
        <section className={styles.qrSection}>
          <h3 className={styles.qrSectionTitle}>{t("qrPubkeyTitle")}</h3>
          <div className={styles.qrCodeWrapper}>
            <QRCodeSVG value={pubkey} size={192} includeMargin />
          </div>
          <p className={styles.qrValue} title={pubkey}>
            {pubkey.slice(0, 12)}…{pubkey.slice(-8)}
          </p>
          <button
            type="button"
            className={styles.ceramicButtonOutlineSmall}
            onClick={() => pubkeyClipboard.copy(pubkey)}
          >
            <CopyIcon size={12} />
            {pubkeyClipboard.copied ? t("copied") : t("copyPubkey")}
          </button>
        </section>

        {lightningAddress && (
          <section className={styles.qrSection}>
            <h3 className={styles.qrSectionTitle}>
              {t("qrLightningTitle")}
            </h3>
            <div className={styles.qrCodeWrapper}>
              <QRCodeSVG
                value={`lightning:${lightningAddress}`}
                size={192}
                includeMargin
              />
            </div>
            <p className={styles.qrValue}>{lightningAddress}</p>
            <button
              type="button"
              className={styles.ceramicButtonOutlineSmall}
              onClick={() => lightningClipboard.copy(lightningAddress)}
            >
              <CopyIcon size={12} />
              {lightningClipboard.copied
                ? t("copied")
                : t("copyLightningShort")}
            </button>
          </section>
        )}
      </div>
    </Modal>
  );
}
