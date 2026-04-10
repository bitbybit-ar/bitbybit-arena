"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/modal";
import { BoltIcon, CopyIcon } from "@/components/icons";
import { fetchLnurlPayEndpoint, fetchInvoice } from "@/lib/nostr/lnurl";
import styles from "./zap-modal.module.scss";

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000];
const LIGHTNING_ADDRESS = process.env.NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS ?? "";

type ZapStatus = "idle" | "sending" | "success" | "error" | "no-webln";

interface ZapModalProps {
  onClose: () => void;
}

export function ZapModal({ onClose }: ZapModalProps) {
  const t = useTranslations("landing.support.zapModal");
  const tc = useTranslations("common");

  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<ZapStatus>("idle");
  const [invoice, setInvoice] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const parsedCustom = Number(customAmount);
  const activeAmount = customAmount && !isNaN(parsedCustom) ? parsedCustom : amount;

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
          setStatus("success");
          return;
        } catch {
          // WebLN rejected or failed — fall through to invoice display
        }
      }

      // No WebLN or it failed — show invoice for manual copy
      setInvoice(pr);
      setStatus("no-webln");
    } catch {
      setErrorKey("errorInvalidAddress");
      setStatus("error");
    }
  }

  async function handleCopyInvoice() {
    await navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal onClose={onClose} title={t("title")} size="sm">
      {status === "success" ? (
        <div className={styles.successState}>
          <BoltIcon size={48} color="var(--color-secondary)" />
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
