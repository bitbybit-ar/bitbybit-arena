"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNostr } from "@/lib/hooks/useNostr";
import { CloseIcon, BoltIcon } from "@/components/icons";
import styles from "./nostr-login-modal.module.scss";

interface NostrLoginModalProps {
  onClose: () => void;
}

export function NostrLoginModal({ onClose }: NostrLoginModalProps) {
  const t = useTranslations("nostrLogin");
  const { hasExtension, login, isLoading } = useNostr();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    const result = await login();
    if (result.success) {
      window.location.reload();
    } else {
      setError(result.error || t("error"));
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label={t("close") || "Close"}>
          <CloseIcon size={20} />
        </button>

        <div className={styles.header}>
          <div className={styles.iconCircle}>
            <BoltIcon size={28} />
          </div>
          <h2 className={styles.title}>{t("title")}</h2>
          <p className={styles.description}>{t("description")}</p>
        </div>

        <div className={styles.content}>
          {hasExtension ? (
            <>
              <button
                className={styles.loginButton}
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? t("connecting") : t("title")}
              </button>
              {error && <p className={styles.error}>{error}</p>}
            </>
          ) : (
            <div className={styles.noExtension}>
              <p className={styles.noExtensionText}>{t("noExtension")}</p>
              <p className={styles.installText}>{t("installExtension")}</p>
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.getAlbyLink}
              >
                {t("getAlby")}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
