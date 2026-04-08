"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useNostr } from "@/lib/hooks/useNostr";
import { BoltIcon, LinkIcon, KeyIcon } from "@/components/icons";
import styles from "./login.module.scss";

export default function LoginPage() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { login, isLoading } = useNostr();
  const [error, setError] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState<string | null>(null);

  const handleExtensionLogin = async () => {
    setError(null);
    setActiveMethod("extension");
    const result = await login();
    if (result.success) {
      router.push("/explore");
    } else {
      setError(result.error || t("error"));
    }
    setActiveMethod(null);
  };

  const handleNostrConnect = () => {
    setError(null);
    setActiveMethod("connect");
    // TODO: Implement Nostr Connect (NIP-46)
    setError(t("comingSoon"));
    setActiveMethod(null);
  };

  const handleSecretKey = () => {
    setError(null);
    setActiveMethod("nsec");
    // TODO: Implement nsec login
    setError(t("comingSoon"));
    setActiveMethod(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.methods}>
          <button
            className={styles.methodButton}
            onClick={handleExtensionLogin}
            disabled={isLoading}
          >
            <BoltIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>{t("extensionTitle")}</span>
              <span className={styles.methodDescription}>{t("extensionDescription")}</span>
            </div>
          </button>

          <button
            className={styles.methodButton}
            onClick={handleNostrConnect}
            disabled={activeMethod === "connect"}
          >
            <LinkIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>{t("connectTitle")}</span>
              <span className={styles.methodDescription}>{t("connectDescription")}</span>
            </div>
          </button>

          <button
            className={`${styles.methodButton} ${styles.methodSecondary}`}
            onClick={handleSecretKey}
            disabled={activeMethod === "nsec"}
          >
            <KeyIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>{t("nsecTitle")}</span>
              <span className={styles.methodDescription}>{t("nsecDescription")}</span>
            </div>
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.wotHint}>
          {t("wotHint")}{" "}
          <a
            href="https://nostr-wot.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.wotLink}
          >
            Nostr WoT Extension
          </a>
        </p>

        <a href="/" className={styles.backLink}>
          {t("backToHome")}
        </a>
      </div>
    </div>
  );
}
