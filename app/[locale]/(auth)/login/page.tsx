"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useNostr } from "@/lib/hooks/useNostr";
import { signChallengeWithNsec } from "@/lib/nostr/nsec-login";
import {
  createConnectSession,
  waitForConnection,
  connectWithBunkerURL,
  signChallengeWithBunker,
} from "@/lib/nostr/nip46-login";
import type { BunkerSigner } from "nostr-tools/nip46";
import {
  BoltIcon,
  LinkIcon,
  KeyIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
} from "@/components/icons";
import styles from "./login.module.scss";

type LoginMethod = "extension" | "connect" | "nsec" | null;
type ConnectStatus = "idle" | "scanning" | "connecting" | "expired";

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
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [connectURI, setConnectURI] = useState("");
  const [bunkerURL, setBunkerURL] = useState("");
  const [copiedURI, setCopiedURI] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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

  /**
   * Authenticate with a BunkerSigner by fetching a challenge and signing it.
   */
  const authenticateWithSigner = useCallback(
    async (signer: BunkerSigner) => {
      try {
        // Get challenge from server
        const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
        if (!challengeRes.ok) {
          setError(t("error"));
          return;
        }
        const { data: challenge } = await challengeRes.json();

        // Sign with remote signer
        const { signedEvent } = await signChallengeWithBunker(
          signer,
          challenge
        );

        // Submit to server
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

        router.push("/explore");
      } finally {
        await signer.close();
      }
    },
    [router, t]
  );

  /**
   * Start the QR code flow: generate URI, wait for remote signer to connect.
   */
  const startNostrConnect = useCallback(async () => {
    setError(null);
    setActiveMethod("connect");

    // Abort any previous connection attempt
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const session = createConnectSession();
    setConnectURI(session.uri);
    setConnectStatus("scanning");

    try {
      const signer = await waitForConnection(session, controller.signal);
      setConnectStatus("connecting");
      await authenticateWithSigner(signer);
    } catch {
      if (!controller.signal.aborted) {
        setConnectStatus("expired");
      }
    }
  }, [authenticateWithSigner]);

  /**
   * Connect via a pasted bunker:// URL.
   */
  const handleBunkerConnect = async () => {
    if (!bunkerURL.trim()) return;
    setError(null);
    // Abort QR scanning flow before starting bunker connection
    abortRef.current?.abort();
    setConnectStatus("connecting");

    try {
      const signer = await connectWithBunkerURL(bunkerURL);
      await authenticateWithSigner(signer);
    } catch {
      setError(t("connectError"));
      setConnectStatus("idle");
    }
  };

  const handleRetryConnect = () => {
    setConnectStatus("idle");
    startNostrConnect();
  };

  const handleCopyURI = async () => {
    await navigator.clipboard.writeText(connectURI);
    setCopiedURI(true);
    setTimeout(() => setCopiedURI(false), 2000);
  };

  const handleNsecLogin = async () => {
    setError(null);
    setNsecLoading(true);

    try {
      const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
      if (!challengeRes.ok) {
        setError(t("error"));
        return;
      }
      const { data: challenge } = await challengeRes.json();

      const { signedEvent } = signChallengeWithNsec(nsecKey, challenge);

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

      setNsecKey("");
      router.push("/explore");
    } catch {
      setNsecKey("");
      setError(t("nsecInvalidKey"));
    } finally {
      setNsecLoading(false);
    }
  };

  const handleMethodClick = (method: LoginMethod) => {
    setError(null);
    if (activeMethod === method) {
      abortRef.current?.abort();
      setActiveMethod(null);
      setConnectStatus("idle");
    } else {
      setActiveMethod(method);
      if (method === "connect") {
        startNostrConnect();
      }
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
            onClick={() => handleMethodClick("connect")}
            disabled={connectStatus === "connecting"}
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

          {/* Nostr Connect expanded panel */}
          {activeMethod === "connect" && (
            <div className={styles.connectPanel}>
              {connectStatus === "scanning" && (
                <>
                  <p className={styles.connectScanTitle}>
                    {t("connectScanTitle")}
                  </p>
                  <div
                    className={styles.qrWrapper}
                    role="img"
                    aria-label={t("connectQrAlt")}
                  >
                    <QRCodeSVG
                      value={connectURI}
                      size={180}
                      level="M"
                      bgColor="transparent"
                      fgColor="currentColor"
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.copyURIBtn}
                    onClick={handleCopyURI}
                  >
                    <CopyIcon size={14} />
                    {copiedURI ? t("connectCopiedURI") : t("connectCopyURI")}
                  </button>
                  <p className={styles.connectWaiting}>
                    {t("connectScanning")}
                  </p>

                  <div className={styles.connectDivider}>
                    <span>{t("connectOrPaste")}</span>
                  </div>

                  <label
                    htmlFor="bunker-input"
                    className={styles.connectBunkerLabel}
                  >
                    {t("connectBunkerLabel")}
                  </label>
                  <div className={styles.bunkerInputRow}>
                    <input
                      id="bunker-input"
                      type="text"
                      className={styles.bunkerInput}
                      placeholder={t("connectBunkerPlaceholder")}
                      value={bunkerURL}
                      onChange={(e) => setBunkerURL(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className={styles.bunkerSubmit}
                      onClick={handleBunkerConnect}
                      disabled={!bunkerURL.trim()}
                    >
                      {t("connectBunkerSubmit")}
                    </button>
                  </div>

                  <p className={styles.connectCompatible}>
                    {t("connectCompatible")}
                  </p>
                </>
              )}

              {connectStatus === "connecting" && (
                <p className={styles.connectWaiting}>
                  {t("connectConnecting")}
                </p>
              )}

              {connectStatus === "expired" && (
                <div className={styles.connectExpired}>
                  <p>{t("connectExpired")}</p>
                  <button
                    className={styles.connectRetryBtn}
                    onClick={handleRetryConnect}
                  >
                    {t("connectRetry")}
                  </button>
                </div>
              )}
            </div>
          )}

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

              <label htmlFor="nsec-input" className={styles.nsecLabel}>
                {t("nsecLabel")}
              </label>
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
                  aria-label={showNsec ? t("hideKey") : t("showKey")}
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
