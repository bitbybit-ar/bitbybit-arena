"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";
import { BoltIcon, CopyIcon } from "@/components/icons";
import { useClipboard } from "@/lib/hooks/useClipboard";
import { useSignerContext } from "@/lib/signer-context";
import { buildZapRequestEvent } from "@/lib/nostr/events";
import { fetchLnurlPayEndpoint, fetchInvoice } from "@/lib/nostr/lnurl";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import { cn } from "@/lib/utils";
import styles from "./fund-pot-modal.module.scss";

const PRESET_AMOUNTS = [210, 1000, 5000, 21_000];
const POLL_INTERVAL_MS = 4000;

type Status =
  | "idle"
  | "signing"
  | "fetching-invoice"
  | "webln-paying"
  | "no-webln"
  | "success"
  | "error";

interface FundPotModalProps {
  /** Kind:9041 event id to `e`-tag in the zap request. */
  goalEventId: string;
  /** Creator's Nostr pubkey — recipient `p` tag on the zap request. */
  creatorPubkey: string;
  /** Creator's lud16 — resolved to LNURL-pay for the invoice. */
  creatorLightningAddress: string | null;
  /** Title of the challenge — shown in modal header + default comment. */
  challengeTitle: string;
  onClose: () => void;
  /**
   * Fires right after a zap is paid (WebLN success or invoice settled
   * via polling). Lets the parent refresh its progress snapshot without
   * waiting on the live relay subscription to catch up.
   */
  onZapped?: () => void;
}

/**
 * NIP-75 "Fund this pot" modal — builds a kind:9734 zap request that
 * `e`-tags the challenge's zap goal event, signs it, resolves the
 * creator's lud16 via LNURL-pay, fetches a BOLT11 invoice with the
 * signed zap request attached, and pays it via WebLN (silent) or a
 * QR + NWC-polling fallback.
 *
 * Mirrors the state machine used by `payWinner` in challenge-client —
 * same polling cadence, same cancellation semantics — so the perceived
 * UX is identical whether you're funding a pot or paying a winner.
 */
export function FundPotModal({
  goalEventId,
  creatorPubkey,
  creatorLightningAddress,
  challengeTitle,
  onClose,
  onZapped,
}: FundPotModalProps) {
  const t = useTranslations("fundPot");
  const tc = useTranslations("common");
  const { signWithPrompt } = useSignerContext();
  const { copied, copy } = useClipboard();

  const [preset, setPreset] = useState(PRESET_AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [invoice, setInvoice] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const parsedCustom = Number(customAmount);
  const activeAmount =
    customAmount && Number.isFinite(parsedCustom) && parsedCustom > 0
      ? Math.floor(parsedCustom)
      : preset;

  const hasLightning = !!creatorLightningAddress;

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  useEffect(() => () => clearPolling(), [clearPolling]);

  const onSuccess = useCallback(() => {
    clearPolling();
    setStatus("success");
    onZapped?.();
  }, [clearPolling, onZapped]);

  const startPolling = useCallback(
    (pr: string) => {
      clearPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/zap/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoice: pr }),
          });
          if (!res.ok) return;
          const { paid } = await res.json();
          if (paid) onSuccess();
        } catch {
          /* ignore tick errors — next interval will retry */
        }
      }, POLL_INTERVAL_MS);
    },
    [clearPolling, onSuccess]
  );

  const handleFund = useCallback(async () => {
    if (!hasLightning || !creatorLightningAddress) {
      setErrorKey("errorNoCreatorLud16");
      setStatus("error");
      return;
    }
    if (activeAmount <= 0) return;

    setStatus("signing");
    setErrorKey(null);
    try {
      const unsigned = buildZapRequestEvent({
        recipientPubkey: creatorPubkey,
        eventId: goalEventId,
        amount: activeAmount,
        relays: DEFAULT_RELAYS,
        comment: message.trim() || `Fund pot: ${challengeTitle}`,
      });
      const signed = await signWithPrompt(unsigned);

      setStatus("fetching-invoice");
      const endpoint = await fetchLnurlPayEndpoint(creatorLightningAddress);
      const pr = await fetchInvoice(
        endpoint.callback,
        activeAmount,
        message.trim() || undefined,
        signed
      );

      if (typeof window !== "undefined" && window.webln) {
        setStatus("webln-paying");
        try {
          await window.webln.enable();
          await window.webln.sendPayment(pr);
          onSuccess();
          return;
        } catch {
          /* fall through to QR fallback */
        }
      }

      setInvoice(pr);
      setStatus("no-webln");
      startPolling(pr);
    } catch {
      setErrorKey("errorInvoice");
      setStatus("error");
    }
  }, [
    activeAmount,
    challengeTitle,
    creatorLightningAddress,
    creatorPubkey,
    goalEventId,
    hasLightning,
    message,
    onSuccess,
    signWithPrompt,
    startPolling,
  ]);

  const disabled =
    status === "signing" ||
    status === "fetching-invoice" ||
    status === "webln-paying" ||
    activeAmount <= 0;

  return (
    <Modal onClose={onClose} title={t("title")} size="sm">
      {status === "success" ? (
        <div className={styles.successState}>
          <div className={styles.boltBounce}>
            <BoltIcon size={48} color="var(--color-secondary)" />
          </div>
          <p className={styles.successText}>{t("success")}</p>
          <button className={styles.closeBtn} onClick={onClose}>
            {tc("close")}
          </button>
        </div>
      ) : status === "no-webln" ? (
        <div className={styles.invoiceState}>
          <p className={styles.description}>{t("noWebln")}</p>
          <div className={styles.qrWrapper}>
            <QRCodeSVG
              value={invoice}
              size={200}
              bgColor="transparent"
              fgColor="var(--color-text-primary)"
              level="M"
            />
          </div>
          <p className={styles.pollingHint}>{t("waitingPayment")}</p>
          <div className={styles.invoiceBox}>
            <code className={styles.invoiceText}>{invoice}</code>
          </div>
          <button className={styles.copyBtn} onClick={() => copy(invoice)}>
            <CopyIcon size={16} />
            {copied ? t("copiedInvoice") : t("copyInvoice")}
          </button>
        </div>
      ) : (
        <>
          <p className={styles.description}>
            {t("description", { title: challengeTitle })}
          </p>

          {!hasLightning && (
            <p className={styles.errorText}>{t("errorNoCreatorLud16")}</p>
          )}

          <label className={styles.label} htmlFor="fund-amount">
            {t("amount")}
          </label>
          <div className={styles.presets}>
            {PRESET_AMOUNTS.map((p) => (
              <button
                key={p}
                type="button"
                className={cn(
                  styles.presetBtn,
                  !customAmount && preset === p && styles.active
                )}
                onClick={() => {
                  setPreset(p);
                  setCustomAmount("");
                }}
                aria-pressed={!customAmount && preset === p}
                disabled={!hasLightning}
              >
                <BoltIcon size={12} />
                {p.toLocaleString()}
              </button>
            ))}
          </div>

          <input
            id="fund-amount"
            type="number"
            className={styles.customInput}
            placeholder={t("customPlaceholder")}
            value={customAmount}
            min={1}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={!hasLightning}
          />

          <label className={styles.label} htmlFor="fund-message">
            {t("message")}
          </label>
          <input
            id="fund-message"
            type="text"
            className={styles.messageInput}
            placeholder={t("messagePlaceholder")}
            value={message}
            maxLength={140}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!hasLightning}
          />

          {status === "error" && errorKey && (
            <p className={styles.errorText}>{t(errorKey)}</p>
          )}

          <button
            className={styles.fundBtn}
            onClick={handleFund}
            disabled={disabled || !hasLightning}
          >
            <BoltIcon size={18} color="white" />
            {status === "signing"
              ? t("signing")
              : status === "fetching-invoice"
                ? t("fetchingInvoice")
                : status === "webln-paying"
                  ? t("paying")
                  : `${t("fund")} ${activeAmount.toLocaleString()} sats`}
          </button>
        </>
      )}
    </Modal>
  );
}
