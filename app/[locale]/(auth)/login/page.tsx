"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useNostr } from "@/lib/hooks/useNostr";
import { signChallengeWithNsec } from "@/lib/nostr/nsec-login";
import {
  BoltIcon,
  LinkIcon,
  KeyIcon,
  EyeIcon,
  EyeOffIcon,
} from "@/components/icons";
import styles from "./login.module.scss";

type LoginMethod = "extension" | "connect" | "nsec" | null;

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const { login, isLoading } = useNostr();
  const [error, setError] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState<LoginMethod>(null);

  // nsec state
  const [nsecKey, setNsecKey] = useState("");
  const [showNsec, setShowNsec] = useState(false);
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [nsecLoading, setNsecLoading] = useState(false);

  // Nostr Connect state
  const [connectStatus, setConnectStatus] = useState<
    "idle" | "scanning" | "expired"
  >("idle");

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

  const handleNostrConnect = async () => {
    setError(null);
    setActiveMethod("connect");
    setConnectStatus("scanning");

    // NIP-46 requires a relay-based handshake with a remote signer.
    // For MVP, show coming soon since it needs a generated keypair,
    // relay subscription, and QR code rendering.
    // TODO: Full NIP-46 implementation with nostr-tools/nip46
    setError(t("comingSoon"));
    setConnectStatus("idle");
    setActiveMethod(null);
  };

  const handleNsecLogin = async () => {
    setError(null);
    setNsecLoading(true);

    try {
      // Step 1: Get challenge from server
      const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
      if (!challengeRes.ok) {
        setError(t("error"));
        return;
      }
      const { data: challenge } = await challengeRes.json();

      // Step 2: Sign challenge client-side with nsec
      const { signedEvent } = signChallengeWithNsec(nsecKey, challenge);

      // Step 3: Submit signed event for verification (same endpoint as extension)
      const authRes = await fetch("/api/auth/nostr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedEvent }),
      });

      if (!authRes.ok) {
        const body = await authRes.json().catch(() => ({}));
        setError(body.error || t("error"));
        return;
      }

      // Clear the key from state immediately after successful login
      setNsecKey("");
      router.push("/explore");
    } catch {
      setError(t("nsecInvalidKey"));
    } finally {
      setNsecLoading(false);
    }
  };

  const handleMethodClick = (method: LoginMethod) => {
    setError(null);
    if (activeMethod === method) {
      setActiveMethod(null);
    } else {
      setActiveMethod(method);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.methods}>
          {/* Browser Extension (NIP-07) */}
          <button
            className={styles.methodButton}
            onClick={handleExtensionLogin}
            disabled={isLoading}
          >
            <BoltIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>
                {t("extensionTitle")}
              </span>
              <span className={styles.methodDescription}>
                {t("extensionDescription")}
              </span>
            </div>
          </button>

          {/* Nostr Connect (NIP-46) */}
          <button
            className={`${styles.methodButton} ${
              activeMethod === "connect" ? styles.methodActive : ""
            }`}
            onClick={handleNostrConnect}
            disabled={connectStatus === "scanning"}
          >
            <LinkIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>
                {t("connectTitle")}
              </span>
              <span className={styles.methodDescription}>
                {t("connectDescription")}
              </span>
            </div>
          </button>

          {/* Paste nsec */}
          <button
            className={`${styles.methodButton} ${styles.methodSecondary} ${
              activeMethod === "nsec" ? styles.methodActive : ""
            }`}
            onClick={() => handleMethodClick("nsec")}
            disabled={nsecLoading}
          >
            <KeyIcon size={20} />
            <div className={styles.methodInfo}>
              <span className={styles.methodName}>{t("nsecTitle")}</span>
              <span className={styles.methodDescription}>
                {t("nsecDescription")}
              </span>
            </div>
          </button>

          {/* nsec expanded panel */}
          {activeMethod === "nsec" && (
            <div className={styles.nsecPanel}>
              <p className={styles.nsecWarning}>{t("nsecWarning")}</p>

              <div className={styles.nsecInputWrapper}>
                <input
                  id="nsec-input"
                  type={showNsec ? "text" : "password"}
                  className={styles.nsecInput}
                  placeholder={t("nsecPlaceholder")}
                  value={nsecKey}
                  onChange={(e) => setNsecKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className={styles.nsecToggle}
                  onClick={() => setShowNsec(!showNsec)}
                  aria-label={showNsec ? "Hide key" : "Show key"}
                >
                  {showNsec ? (
                    <EyeOffIcon size={16} />
                  ) : (
                    <EyeIcon size={16} />
                  )}
                </button>
              </div>

              <label className={styles.nsecCheckbox}>
                <input
                  type="checkbox"
                  checked={acceptedRisk}
                  onChange={(e) => setAcceptedRisk(e.target.checked)}
                />
                <span>{t("nsecAcceptRisk")}</span>
              </label>

              <button
                className={styles.nsecSubmit}
                onClick={handleNsecLogin}
                disabled={!nsecKey.trim() || !acceptedRisk || nsecLoading}
              >
                {nsecLoading ? t("nsecSigningIn") : t("nsecSignIn")}
              </button>
            </div>
          )}
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
