"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";
import { BoltIcon, CopyIcon } from "@/components/icons";
import { fetchLnurlPayEndpoint, fetchInvoice } from "@/lib/nostr/lnurl";
import { useClipboard } from "@/lib/hooks/useClipboard";
import styles from "./zap-modal.module.scss";

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000];
const LIGHTNING_ADDRESS = process.env.NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS ?? "";
const POLL_INTERVAL_MS = 4000;
const CONFETTI_COUNT = 24;
const CONFETTI_COLORS = ["#8B5CF6", "#F7A825", "#22C55E", "#EF4444", "#3B82F6"];

type ZapStatus = "idle" | "sending" | "success" | "error" | "no-webln";

interface ZapModalProps {
  onClose: () => void;
}

// Deterministic confetti (seeded RNG to avoid hydration issues)
function seedRandom(seed: number) {
  return () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const rng = seedRandom(42);
const CONFETTI_PARTICLES = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  left: rng() * 100,
  delay: rng() * 0.6,
  duration: 0.8 + rng() * 0.6,
  rotation: rng() * 360,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 4 + rng() * 6,
}));

export function ZapModal({ onClose }: ZapModalProps) {
  const t = useTranslations("landing.support.zapModal");
  const tc = useTranslations("common");

  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<ZapStatus>("idle");
  const [invoice, setInvoice] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const { copied, copy: copyToClipboard } = useClipboard();
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const parsedCustom = Number(customAmount);
  const activeAmount = customAmount && !isNaN(parsedCustom) ? parsedCustom : amount;

  const triggerSuccess = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("success");
    setShowConfetti(true);
    confettiTimeout.current = setTimeout(() => setShowConfetti(false), 2000);
  }, []);

  // Poll for payment confirmation when showing QR
  const startPolling = useCallback(
    (invoiceStr: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/zap/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoice: invoiceStr }),
          });

          if (res.ok) {
            const { paid } = await res.json();
            if (paid) triggerSuccess();
          }
        } catch {
          // Silently ignore polling errors
        }
      }, POLL_INTERVAL_MS);
    },
    [triggerSuccess]
  );

  useEffect(() => {
    return () => {
      if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleZap() {
    if (!activeAmount || activeAmount <= 0) return;

    if (!LIGHTNING_ADDRESS) {
      setErrorKey("errorNoAddress");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorKey(null);

    try {
      const endpoint = await fetchLnurlPayEndpoint(LIGHTNING_ADDRESS);
      const pr = await fetchInvoice(endpoint.callback, activeAmount, comment || undefined);

      // Try WebLN (browser extension) first
      if (window.webln) {
        try {
          await window.webln.enable();
          await window.webln.sendPayment(pr);
          triggerSuccess();
          return;
        } catch {
          // WebLN rejected or failed — fall through to invoice display
        }
      }

      // No WebLN or it failed — show invoice for manual payment
      setInvoice(pr);
      setStatus("no-webln");
      startPolling(pr);
    } catch {
      setErrorKey("errorInvalidAddress");
      setStatus("error");
    }
  }

  async function handleCopyInvoice() {
    await copyToClipboard(invoice);
  }

  return (
    <Modal onClose={onClose} title={t("title")} size="sm">
      {status === "success" ? (
        <div className={styles.successState}>
          {showConfetti && (
            <div className={styles.confettiContainer} aria-hidden="true">
              {CONFETTI_PARTICLES.map((p, i) => (
                <div
                  key={i}
                  className={styles.confettiPiece}
                  style={{
                    left: `${p.left}%`,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.duration}s`,
                    backgroundColor: p.color,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    transform: `rotate(${p.rotation}deg)`,
                  }}
                />
              ))}
            </div>
          )}
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
          <button className={styles.copyBtn} onClick={handleCopyInvoice}>
            <CopyIcon size={16} />
            {copied ? t("copiedInvoice") : t("copyInvoice")}
          </button>
        </div>
      ) : (
        <>
          <p className={styles.description}>{t("description")}</p>

          <label className={styles.label} htmlFor="zap-amount">{t("amount")}</label>
          <div className={styles.presets}>
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetBtn} ${
                  !customAmount && amount === preset ? styles.active : ""
                }`}
                onClick={() => {
                  setAmount(preset);
                  setCustomAmount("");
                }}
                aria-pressed={!customAmount && amount === preset}
              >
                <BoltIcon size={12} />
                {preset.toLocaleString()}
              </button>
            ))}
          </div>

          <input
            id="zap-amount"
            type="number"
            className={styles.customInput}
            placeholder={t("customPlaceholder")}
            value={customAmount}
            min={1}
            onChange={(e) => setCustomAmount(e.target.value)}
          />

          <label className={styles.label} htmlFor="zap-comment">{t("comment")}</label>
          <input
            id="zap-comment"
            type="text"
            className={styles.commentInput}
            placeholder={t("commentPlaceholder")}
            value={comment}
            maxLength={140}
            onChange={(e) => setComment(e.target.value)}
          />

          {status === "error" && (
            <p className={styles.errorText}>
              {errorKey ? t(errorKey) : t("error")}
            </p>
          )}

          <button
            className={styles.zapBtn}
            onClick={handleZap}
            disabled={status === "sending" || !activeAmount || activeAmount <= 0}
          >
            <BoltIcon size={18} color="white" />
            {status === "sending"
              ? t("sending")
              : `${t("send")} ${activeAmount.toLocaleString()} sats`}
          </button>
        </>
      )}
    </Modal>
  );
}
