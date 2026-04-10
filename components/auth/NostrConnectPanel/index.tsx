"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import type { BunkerSigner } from "nostr-tools/nip46";
import {
  createConnectSession,
  waitForConnection,
  connectWithBunkerURL,
} from "@/lib/nostr/nip46-login";
import {
  type SignerHandle,
  makeNip46Signer,
} from "@/lib/nostr/signers";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/icons";
import { BlockTower } from "@/components/common/BlockTower";
import styles from "./nostr-connect-panel.module.scss";

interface NostrConnectPanelProps {
  onSigner: (signer: SignerHandle) => void | Promise<void>;
  onError?: (key: string) => void;
  /** When provided, rejects signers whose pubkey doesn't match. */
  expectedPubkey?: string;
}

type ConnectStatus = "scanning" | "connecting" | "expired";

/**
 * NIP-46 Nostr Connect flow. Shows a QR code with a nostrconnect:// URI
 * and accepts a pasted bunker:// URL as a fallback. On successful
 * connection, produces a `SignerHandle` backed by the live BunkerSigner
 * and emits it via `onSigner`. The parent is responsible for keeping
 * the signer alive (i.e. handing it to SignerProvider) — if the parent
 * rejects it via mismatch, the bunker is closed here.
 */
export function NostrConnectPanel({
  onSigner,
  onError,
  expectedPubkey,
}: NostrConnectPanelProps) {
  const t = useTranslations("login");
  const [status, setStatus] = useState<ConnectStatus>("scanning");
  const [uri, setUri] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const finalize = useCallback(
    async (bunker: BunkerSigner) => {
      try {
        const pubkey = await bunker.getPublicKey();
        if (expectedPubkey && pubkey !== expectedPubkey) {
          await bunker.close();
          onError?.("mismatch");
          return;
        }
        await onSigner(makeNip46Signer(bunker, pubkey));
      } catch {
        try {
          await bunker.close();
        } catch {
          /* ignore */
        }
        onError?.("connectError");
      }
    },
    [expectedPubkey, onSigner, onError]
  );

  const startScan = useCallback(() => {
    setLocalError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const session = createConnectSession();
    setUri(session.uri);
    setStatus("scanning");

    waitForConnection(session, controller.signal)
      .then(async (bunker) => {
        setStatus("connecting");
        await finalize(bunker);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("expired");
      });
  }, [finalize]);

  useEffect(() => {
    startScan();
    return () => {
      abortRef.current?.abort();
    };
  }, [startScan]);

  const handleBunkerConnect = async () => {
    if (!bunkerUrl.trim()) return;
    abortRef.current?.abort();
    setStatus("connecting");
    setLocalError(null);
    try {
      const bunker = await connectWithBunkerURL(bunkerUrl);
      await finalize(bunker);
    } catch {
      setLocalError(t("connectError"));
      startScan();
    }
  };

  const handleCopyURI = async () => {
    await navigator.clipboard.writeText(uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "connecting") {
    return (
      <div className={styles.connectingState}>
        <BlockTower maxBlocks={3} blockSize="medium" />
        <p className={styles.waiting}>{t("connectConnecting")}</p>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className={styles.expired}>
        <p>{t("connectExpired")}</p>
        <Button type="button" variant="primary" size="sm" onClick={startScan}>
          {t("connectRetry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className={styles.scanTitle}>{t("connectScanTitle")}</p>
      <div
        className={styles.qrWrapper}
        role="img"
        aria-label={t("connectQrAlt")}
      >
        <QRCodeSVG
          value={uri}
          size={180}
          level="M"
          bgColor="transparent"
          fgColor="currentColor"
        />
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className={styles.copyURIBtn}
        onClick={handleCopyURI}
      >
        <CopyIcon size={14} />
        {copied ? t("connectCopiedURI") : t("connectCopyURI")}
      </Button>
      <p className={styles.waiting}>{t("connectScanning")}</p>

      <div className={styles.divider}>
        <span>{t("connectOrPaste")}</span>
      </div>

      <label htmlFor="bunker-input" className={styles.bunkerLabel}>
        {t("connectBunkerLabel")}
      </label>
      <div className={styles.bunkerInputRow}>
        <input
          id="bunker-input"
          type="text"
          className={styles.bunkerInput}
          placeholder={t("connectBunkerPlaceholder")}
          value={bunkerUrl}
          onChange={(e) => setBunkerUrl(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleBunkerConnect}
          disabled={!bunkerUrl.trim()}
        >
          {t("connectBunkerSubmit")}
        </Button>
      </div>

      {localError && <p className={styles.errorInModal}>{localError}</p>}

      <p className={styles.compatible}>{t("connectCompatible")}</p>
    </>
  );
}
