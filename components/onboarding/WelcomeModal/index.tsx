"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/contexts/session-context";
import { translateApiError } from "@/lib/api/translate-error";
import { BoltIcon, KeyIcon, FlagIcon } from "@/components/icons";
import styles from "./welcome-modal.module.scss";

interface WelcomeModalProps {
  onClose: () => void;
}

export function WelcomeModal({ onClose }: WelcomeModalProps) {
  const t = useTranslations("onboarding");
  const tErr = useTranslations("errors.codes");
  const { showToast } = useToast();
  const { refresh } = useSession();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/profile/sync", { method: "POST" });
      const json = await res.json();
      if (json.success && json.data) {
        showToast(t("syncSuccess"), "success");
        await refresh();
        onClose();
      } else if (json.code === "no_metadata_found") {
        // Specific guidance: relays didn't return a kind:0. The placeholder
        // identity stays, so we don't dismiss — let the user pick the
        // manual path instead of falling back silently.
        showToast(t("syncEmpty"), "info");
      } else {
        showToast(translateApiError(json, tErr, t("syncFailed")), "error");
      }
    } catch {
      showToast(t("syncFailed"), "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleManual = () => {
    onClose();
    router.push("/settings");
  };

  return (
    <Modal onClose={onClose} title={t("welcomeTitle")} size="sm">
      <p className={styles.intro}>{t("welcomeIntro")}</p>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          fullWidth
          onClick={handleSync}
          disabled={syncing}
        >
          <BoltIcon size={18} />
          <div className={styles.actionInfo}>
            <span className={styles.actionLabel}>
              {syncing ? t("syncing") : t("syncCta")}
            </span>
            <span className={styles.actionHint}>{t("syncHint")}</span>
          </div>
        </Button>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={handleManual}
          disabled={syncing}
        >
          <KeyIcon size={18} />
          <div className={styles.actionInfo}>
            <span className={styles.actionLabel}>{t("manualCta")}</span>
            <span className={styles.actionHint}>{t("manualHint")}</span>
          </div>
        </Button>
      </div>

      <button
        type="button"
        className={styles.skip}
        onClick={onClose}
        disabled={syncing}
      >
        <FlagIcon size={14} />
        {t("skipCta")}
      </button>
    </Modal>
  );
}
