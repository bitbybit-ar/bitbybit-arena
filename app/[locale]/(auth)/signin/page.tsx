"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { createNewIdentity } from "@/lib/nostr/create-account";
import { useSignerContext } from "@/lib/signer-context";
import { makeNsecSigner } from "@/lib/nostr/signers";
import type { SignerHandle } from "@/lib/nostr/signers";
import type { AuthError } from "@/lib/nostr/auth-errors";
import { useAuthErrorLookup } from "@/lib/hooks/useAuthErrorLookup";
import { SignerMethodButtons } from "@/components/auth/SignerMethodButtons";
import { ExtensionUpsell } from "@/components/auth/ExtensionUpsell";
import { NsecSignerForm } from "@/components/auth/NsecSignerForm";
import { NostrConnectPanel } from "@/components/auth/NostrConnectPanel";
import { Block } from "@/components/common/Block";
import { Bubble } from "@/components/common/Bubble";
import {
  ArrowLeftIcon,
  BoltIcon,
  LinkIcon,
  KeyIcon,
  CopyIcon,
  CheckIcon,
  FlagIcon,
} from "@/components/icons";
import styles from "./signin.module.scss";

type Panel = "picker" | "nsec" | "nip46";

export default function SignInPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const lookupAuthError = useAuthErrorLookup();
  const { completeLoginWithSigner, setSigner } = useSignerContext();

  const [panel, setPanel] = useState<Panel>("picker");
  const [error, setError] = useState<string | null>(null);

  // Create account state
  const [creating, setCreating] = useState(false);
  const [createdNsec, setCreatedNsec] = useState<string | null>(null);
  const [copiedNsec, setCopiedNsec] = useState(false);
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);

  const handleSignerFromChild = async (signer: SignerHandle) => {
    setError(null);
    const ok = await completeLoginWithSigner(signer);
    if (!ok) {
      setError(t("error"));
      return;
    }
    router.push("/explore");
  };

  const handleError = (err: AuthError) => {
    setError(lookupAuthError(err));
  };

  const handleCreateAccount = async () => {
    setError(null);
    setCreating(true);
    try {
      const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
      if (!challengeRes.ok) {
        setError(t("error"));
        return;
      }
      const { data: challenge } = await challengeRes.json();

      const identity = createNewIdentity(challenge);

      const authRes = await fetch("/api/auth/nostr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedEvent: identity.signedEvent }),
      });
      if (!authRes.ok) {
        const body = await authRes.json().catch(() => ({}));
        setError(body.error || t("error"));
        return;
      }

      setSigner(makeNsecSigner(identity.secretKey, identity.pubkey));
      setCreatedNsec(identity.nsec);
    } catch {
      setError(t("error"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyNsec = async () => {
    if (!createdNsec) return;
    await navigator.clipboard.writeText(createdNsec);
    setCopiedNsec(true);
    setTimeout(() => setCopiedNsec(false), 2000);
  };

  const handleContinueAfterCreate = () => {
    setCreatedNsec(null);
    setSavedAcknowledged(false);
    router.push("/explore");
  };

  const closePanel = () => {
    setPanel("picker");
    setError(null);
  };

  return (
    <div className={styles.page}>
      {/* Floating decorative elements */}
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="small" color="gold" className={styles.floatBlock2}>
        <KeyIcon size={16} color="white" />
      </Block>
      <Block size="medium" color="green" className={styles.floatBlock3}>
        <LinkIcon size={22} color="white" />
      </Block>
      <Bubble
        size={120}
        color="purple"
        opacity={0.2}
        position={{ top: "10%", left: "8%" }}
        animation="float-slow"
      />
      <Bubble
        size={80}
        color="gold"
        opacity={0.2}
        position={{ bottom: "15%", right: "10%" }}
        animation="drift"
        delay={1}
      />

      <div className={styles.card}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <SignerMethodButtons
          onSigner={handleSignerFromChild}
          onError={handleError}
          onSelectNip46={() => setPanel("nip46")}
          onSelectNsec={() => setPanel("nsec")}
          animate
        />

        <div className={styles.createDivider}>
          <span>{t("orNew")}</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          className={styles.createButton}
          onClick={handleCreateAccount}
          disabled={creating}
        >
          <BoltIcon size={20} />
          <div className={styles.createInfo}>
            <span className={styles.createName}>
              {creating ? t("creatingIdentity") : t("createIdentity")}
            </span>
            <span className={styles.createDescription}>
              {t("createIdentityDescription")}
            </span>
          </div>
        </Button>

        {error && panel === "picker" && <p className={styles.error}>{error}</p>}

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
          ?
        </p>
      </div>

      <div className={styles.backLinkWrapper}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeftIcon size={16} />
          {t("backToHome")}
        </Link>
      </div>

      {panel === "nip46" && (
        <Modal onClose={closePanel} title={t("connectTitle")} size="sm">
          <NostrConnectPanel
            onSigner={handleSignerFromChild}
            onError={handleError}
          />
          {error && <p className={styles.error}>{error}</p>}
        </Modal>
      )}

      {panel === "nsec" && (
        <Modal onClose={closePanel} title={t("nsecTitle")} size="sm">
          <NsecSignerForm
            onSigner={handleSignerFromChild}
            onError={handleError}
            showWarning
            requireAcceptRisk
            submitLabel={t("nsecSignIn")}
            submittingLabel={t("nsecSigningIn")}
          />
          <ExtensionUpsell variant="nsec" />
          {error && <p className={styles.error}>{error}</p>}
        </Modal>
      )}

      {createdNsec && (
        <Modal
          onClose={handleContinueAfterCreate}
          title={t("createdTitle")}
          size="sm"
        >
          <div className={styles.createdSuccess}>
            <CheckIcon size={32} />
          </div>
          <p className={styles.createdIntro}>{t("createdIntro")}</p>

          <label className={styles.createdLabel}>{t("createdNsecLabel")}</label>
          <div className={styles.createdNsecBox}>
            <code className={styles.createdNsec}>{createdNsec}</code>
            <button
              type="button"
              className={styles.createdCopyBtn}
              onClick={handleCopyNsec}
              aria-label={t("createdCopy")}
            >
              <CopyIcon size={14} />
              {copiedNsec ? t("createdCopied") : t("createdCopy")}
            </button>
          </div>

          <div className={styles.createdWarning}>
            <FlagIcon size={16} />
            <span>{t("createdWarning")}</span>
          </div>

          <ExtensionUpsell variant="created" />

          <label className={styles.createdAck}>
            <input
              type="checkbox"
              checked={savedAcknowledged}
              onChange={(e) => setSavedAcknowledged(e.target.checked)}
            />
            <span>{t("createdAckLabel")}</span>
          </label>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={handleContinueAfterCreate}
            disabled={!savedAcknowledged}
          >
            {t("createdContinue")}
          </Button>
        </Modal>
      )}
    </div>
  );
}
