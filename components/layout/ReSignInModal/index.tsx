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
import type { SignerHandle, SignerType } from "@/lib/nostr/signers";
import { type AuthError, loginError, reSignInError } from "@/lib/nostr/auth-errors";
import { useAuthErrorLookup } from "@/lib/hooks/useAuthErrorLookup";
import styles from "./re-sign-in-modal.module.scss";

interface ReSignInModalProps {
  open: boolean;
  onSigner: (signer: SignerHandle) => void;
  onCancel: () => void;
}

type Method = "pick" | "nsec" | "nip46";

const ALL_METHODS: SignerType[] = ["extension", "nip46", "nsec"];

/**
 * Restrict re-attach options based on how the user originally signed in.
 * The hierarchy treats extension as strongest and nsec as weakest: a user
 * is only ever offered methods at least as strong as their original one,
 * so an extension user can't fall back to pasting their nsec just because
 * they reloaded the tab.
 *
 * - Extension login → only extension
 * - NIP-46 login    → extension or NIP-46
 * - nsec login      → all three (the user already accepted the risk)
 * - Login mode (no session yet) or sessions issued before this field
 *   existed → all three (no preference recorded)
 */
function methodsForSigner(signerType: SignerType | null | undefined): SignerType[] {
  switch (signerType) {
    case "extension":
      return ["extension"];
    case "nip46":
      return ["extension", "nip46"];
    case "nsec":
      return ALL_METHODS;
    default:
      return ALL_METHODS;
  }
}

/**
 * Signer modal. Serves two flows:
 *
 *  - **Reattach mode** — user already has a valid session cookie but lost
 *    their in-memory signer (reload after nsec / NIP-46 login). We verify
 *    the new signer's pubkey matches `session.nostr_pubkey` and attach it.
 *    No server round trip.
 *
 *  - **Login mode** — user has no session at all (anonymous). We run the
 *    full NIP-98 HTTP Auth flow via `completeLoginWithSigner` to set
 *    the cookie AND the signer in one shot.
 *
 * The mode is decided by reading `session` from SignerContext when the
 * modal handles a signer produced by one of the three shared auth
 * components (extension, nsec, NIP-46).
 */
export function ReSignInModal({ open, onSigner, onCancel }: ReSignInModalProps) {
  const t = useTranslations("reSignIn");
  const tLogin = useTranslations("login");
  const lookupAuthError = useAuthErrorLookup();
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
  // Login mode hasn't picked a method yet → offer all three. Re-attach
  // mode narrows the picker to methods at least as strong as the user's
  // original sign-in.
  const allowedMethods = isLoginMode
    ? ALL_METHODS
    : methodsForSigner(session?.signer_type);

  const handleError = (err: AuthError) => {
    setError(lookupAuthError(err));
    setBusy(false);
  };

  const handleSignerFromChild = async (signer: SignerHandle) => {
    setError(null);
    setBusy(true);
    try {
      if (isLoginMode) {
        const result = await completeLoginWithSigner(signer);
        if (!result.ok) {
          setError(
            lookupAuthError(
              result.reason === "rate_limited"
                ? loginError("rate_limited")
                : reSignInError("authFailed")
            )
          );
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

  const backButton = (
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
  );

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
            allowedMethods={allowedMethods}
          />

          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      {method === "nsec" && (
        <>
          {backButton}
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
          {backButton}
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
