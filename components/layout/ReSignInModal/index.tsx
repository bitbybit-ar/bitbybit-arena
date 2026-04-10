"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SignerMethodButtons } from "@/components/auth/SignerMethodButtons";
import { ExtensionUpsell } from "@/components/auth/ExtensionUpsell";
import { NsecSignerForm } from "@/components/auth/NsecSignerForm";
import { NostrConnectPanel } from "@/components/auth/NostrConnectPanel";
import { ArrowLeftIcon } from "@/components/icons";
import { useSignerContext } from "@/lib/signer-context";
import type { SignerHandle } from "@/lib/nostr/signers";
import styles from "./re-sign-in-modal.module.scss";

interface ReSignInModalProps {
  open: boolean;
  onSigner: (signer: SignerHandle) => void;
  onCancel: () => void;
}

type Method = "pick" | "nsec" | "nip46";

/**
 * Signer modal. Serves two flows:
 *
 *  - **Reattach mode** — user already has a valid session cookie but lost
 *    their in-memory signer (reload after nsec / NIP-46 login). We verify
 *    the new signer's pubkey matches `session.nostr_pubkey` and attach it.
 *    No NIP-42 round trip.
 *
 *  - **Login mode** — user has no session at all (anonymous). We run the
 *    full NIP-42 challenge/response via `completeLoginWithSigner` to set
 *    the cookie AND the signer in one shot.
 *
 * The mode is decided by reading `session` from SignerContext when the
 * modal handles a signer produced by one of the three shared auth
 * components (extension, nsec, NIP-46).
 */
export function ReSignInModal({ open, onSigner, onCancel }: ReSignInModalProps) {
  const t = useTranslations("reSignIn");
  const tLogin = useTranslations("login");
  const { session, setSigner, completeLoginWithSigner } = useSignerContext();
  const [method, setMethod] = useState<Method>("pick");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMethod("pick");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const expectedPubkey = session?.nostr_pubkey;
  const isLoginMode = !session;

  const lookupErrorKey = (key: string): string => {
    try {
      return t(key);
    } catch {
      try {
        return tLogin(key);
      } catch {
        return key;
      }
    }
  };

  const handleError = (key: string) => {
    setError(lookupErrorKey(key));
    setBusy(false);
  };

  const handleSignerFromChild = async (signer: SignerHandle) => {
    setError(null);
    setBusy(true);
    try {
      if (isLoginMode) {
        const ok = await completeLoginWithSigner(signer);
        if (!ok) {
          setError(lookupErrorKey("authFailed"));
          return;
        }
      } else {
        // Reattach: child component already verified the pubkey match.
        setSigner(signer);
      }
      onSigner(signer);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError(null);
    setMethod("pick");
  };

  const title = isLoginMode
    ? tLogin("title")
    : method === "pick"
    ? t("title")
    : method === "nsec"
    ? tLogin("nsecTitle")
    : tLogin("connectTitle");

  return (
    <Modal onClose={onCancel} title={title} size="sm">
      {method === "pick" && (
        <>
          <p className={styles.intro}>
            {isLoginMode ? tLogin("subtitle") : t("intro")}
          </p>

          <SignerMethodButtons
            onSigner={handleSignerFromChild}
            onError={handleError}
            expectedPubkey={expectedPubkey}
            onSelectNip46={() => setMethod("nip46")}
            onSelectNsec={() => setMethod("nsec")}
            disabled={busy}
          />

          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      {method === "nsec" && (
        <>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={styles.backBtn}
            onClick={goBack}
          >
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Button>
          <NsecSignerForm
            onSigner={handleSignerFromChild}
            onError={handleError}
            expectedPubkey={expectedPubkey}
            showWarning
            requireAcceptRisk={isLoginMode}
            submitLabel={isLoginMode ? tLogin("nsecSignIn") : t("attachKey")}
            submittingLabel={tLogin("nsecSigningIn")}
          />
          <ExtensionUpsell variant="nsec" />
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      {method === "nip46" && (
        <>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={styles.backBtn}
            onClick={goBack}
          >
            <ArrowLeftIcon size={14} />
            {t("back")}
          </Button>
          <NostrConnectPanel
            onSigner={handleSignerFromChild}
            onError={handleError}
            expectedPubkey={expectedPubkey}
          />
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}
    </Modal>
  );
}
