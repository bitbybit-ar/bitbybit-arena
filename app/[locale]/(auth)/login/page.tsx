"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useNostr } from "@/lib/hooks/useNostr";
import { NostrichIcon } from "@/components/icons";
import styles from "./login.module.scss";

export default function LoginPage() {
  const t = useTranslations("login");
  const tNostr = useTranslations("nostrLogin");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { hasExtension, login, isLoading } = useNostr();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    const result = await login();
    if (result.success) {
      router.push("/explore");
    } else {
      setError(result.error || tNostr("error"));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconCircle}>
          <NostrichIcon size={32} />
        </div>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        {hasExtension ? (
          <button
            className={styles.loginButton}
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? tNostr("connecting") : tCommon("signInWithNostr")}
          </button>
        ) : (
          <div className={styles.noExtension}>
            <p className={styles.noExtensionText}>{tNostr("noExtension")}</p>
            <p className={styles.installText}>{tNostr("installExtension")}</p>
            <a
              href="https://getalby.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.getAlbyLink}
            >
              {tNostr("getAlby")}
            </a>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <a href="/" className={styles.backLink}>
          {t("backToHome")}
        </a>
      </div>
    </div>
  );
}
