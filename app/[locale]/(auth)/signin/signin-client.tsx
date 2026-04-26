"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { createNewIdentity } from "@/lib/nostr/create-account";
import { useSignerContext, type LoginResult } from "@/lib/signer-context";
import { makeNsecSigner } from "@/lib/nostr/signers";
import type { SignerHandle } from "@/lib/nostr/signers";
import {
  type AuthError,
  loginError,
  isSignerCancellation,
} from "@/lib/nostr/auth-errors";
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

// Whitelist for the `next` query param. We only honor known internal
// paths so a malicious link can't redirect users to a third-party site
// after login (open-redirect class). Add new entries when new flows
// need a redirect.
const ALLOWED_NEXT_PATHS = new Set(["/explore", "/create", "/my-challenges", "/settings"]);

function safeNext(raw: string | null): string {
  if (!raw) return "/explore";
  if (ALLOWED_NEXT_PATHS.has(raw)) return raw;
  // Allow `/explore/<id>` so a "join this challenge" link survives the
  // signin bounce.
  if (raw.startsWith("/explore/") && !raw.includes("..") && !raw.includes("//")) {
    return raw;
  }
  return "/explore";
}

export function SignInClient() {
  const t = useTranslations("login");
  const tErr = useTranslations("errors.codes");
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const lookupAuthError = useAuthErrorLookup();
  const { completeLoginWithSigner } = useSignerContext();

  // Map a granular LoginResult into a localized string for the banner.
  // Returns null when the failure should be silent (signer cancellation),
  // which is the case the previous "everything → 'error'" lookup got
  // wrong: cancelling the extension popup used to flash the same red
  // error as a real auth failure.
  const messageFor = (result: Extract<LoginResult, { ok: false }>): string | null => {
    if (result.reason === "signer") {
      if (isSignerCancellation(result.cause)) return null;
      return lookupAuthError(loginError("nostr_signing_rejected"));
    }
    if (result.reason === "rate_limited") {
      return lookupAuthError(loginError("rate_limited"));
    }
    if (result.reason === "network") {
      return tErr("network_error");
    }
    // result.reason === "api"
    if (result.code) {
      try {
        const translated = tErr(result.code);
        if (translated && translated !== result.code) return translated;
      } catch {
        /* unknown code → generic fallback */
      }
    }
    return lookupAuthError(loginError("error"));
  };

  const [panel, setPanel] = useState<Panel>("picker");
  const [error, setError] = useState<string | null>(null);

  // Create account state
  const [creating, setCreating] = useState(false);
  const [copiedNsec, setCopiedNsec] = useState(false);
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);

  // Discriminated state machine for the create-identity flow. Each
  // variant carries exactly the fields that variant needs:
  //
  //  - `idle`        : no identity generation in flight, modal closed
  //  - `auth_failed` : nsec is generated and on screen, the auth
  //                    round-trip failed; carries the signer for
  //                    retry + the localized error to render. Until
  //                    we leave this state the Continue CTA stays
  //                    disabled and the Retry CTA renders.
  //  - `ready`       : auth succeeded, the modal stays open so the
  //                    user can copy the nsec and click Continue.
  //
  // Encoding it as a tagged union makes it impossible to forget the
  // signer-clearing step on success — the success transition is
  // `auth_failed → ready` which simply swaps to a variant without
  // a `signer` field.
  type CreateState =
    | { kind: "idle" }
    | { kind: "auth_failed"; nsec: string; signer: SignerHandle; error: string | null }
    | { kind: "ready"; nsec: string };
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const createdNsec =
    createState.kind === "idle" ? null : createState.nsec;
  const isAuthFailed = createState.kind === "auth_failed";

  const handleSignerFromChild = async (signer: SignerHandle) => {
    setError(null);
    const result = await completeLoginWithSigner(signer);
    if (!result.ok) {
      const msg = messageFor(result);
      if (msg) setError(msg);
      return;
    }
    router.push(nextPath);
  };

  const handleError = (err: AuthError) => {
    setError(lookupAuthError(err));
  };

  const handleCreateAccount = async () => {
    setError(null);
    setCreating(true);
    try {
      const { secretKey, pubkey, nsec } = createNewIdentity();
      const signer = makeNsecSigner(secretKey, pubkey);
      // Route through the same helper nsec login uses so the session
      // cookie AND the client session context end up in sync. Doing a
      // bare fetch + setSigner leaves useSession() stale until the next
      // refetch, which made `/explore` render as logged-out.
      //
      // IMPORTANT: enter `auth_failed` BEFORE awaiting the login
      // round-trip — this puts the freshly-generated nsec on screen
      // immediately. If the network drops mid-call, the user already
      // has their key visible and the Retry CTA renders as soon as
      // the await resolves. The previous version silently lost the
      // key on any failure, leaving the user with a Nostr identity
      // they could never sign with again.
      setCreateState({ kind: "auth_failed", nsec, signer, error: null });
      const result = await completeLoginWithSigner(signer);
      if (!result.ok) {
        const msg = messageFor(result);
        // Stay in auth_failed; just record the localized error so
        // the retry block renders the right message.
        setCreateState({
          kind: "auth_failed",
          nsec,
          signer,
          error: msg ?? null,
        });
        return;
      }
      // Auth succeeded — transition to `ready`. The signer field
      // drops off the variant entirely so any code path that tried
      // to reuse it post-success would fail to type-check.
      setCreateState({ kind: "ready", nsec });
    } catch {
      // Pre-await throw (signer creation, etc.). Use the unsigned
      // initial draft we built above — but we can't reach into it
      // from this catch block without lifting it out, and a hard
      // failure here is rare. Surface the generic error and reset
      // to idle so the user can try again from scratch.
      setError(t("error"));
      setCreateState({ kind: "idle" });
    } finally {
      setCreating(false);
    }
  };

  // Retry the auth round-trip with the SAME signer we generated on
  // the first attempt. Critical: do not call createNewIdentity()
  // again — that would burn the user's first nsec and replace it
  // with a fresh one they haven't memorized.
  const retryCreateAccountAuth = async () => {
    if (createState.kind !== "auth_failed") return;
    const { nsec, signer } = createState;
    setCreateState({ kind: "auth_failed", nsec, signer, error: null });
    setCreating(true);
    try {
      const result = await completeLoginWithSigner(signer);
      if (!result.ok) {
        const msg = messageFor(result);
        setCreateState({
          kind: "auth_failed",
          nsec,
          signer,
          error: msg ?? null,
        });
        return;
      }
      setCreateState({ kind: "ready", nsec });
    } catch {
      setCreateState({
        kind: "auth_failed",
        nsec,
        signer,
        error: t("error"),
      });
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
    setCreateState({ kind: "idle" });
    setSavedAcknowledged(false);
    router.push(nextPath);
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
        <p className={styles.subtitle}>
          {nextPath === "/create" ? t("subtitleCreate") : t("subtitle")}
        </p>

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

          {/*
            Auth-failed branch: the nsec is already on screen so the
            user can save it, but we couldn't create a session. Show
            the localized failure + a Retry button that re-uses the
            already-generated signer (NEVER spawns a new identity —
            that would orphan the key the user is reading right now).
            Rendered exclusively from the `auth_failed` variant so
            we can't accidentally show this block once auth has
            succeeded.
          */}
          {createState.kind === "auth_failed" && (
            <div className={styles.createdAuthError}>
              {createState.error && (
                <p className={styles.error}>{createState.error}</p>
              )}
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={retryCreateAccountAuth}
                disabled={creating}
              >
                {creating ? t("creatingIdentity") : t("createdRetryAuth")}
              </Button>
            </div>
          )}

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
            // Continue is only meaningful in the `ready` variant —
            // disabling it any time auth hasn't succeeded prevents
            // a click from pushing the user into the app with an
            // unauthenticated session.
            disabled={!savedAcknowledged || isAuthFailed}
          >
            {t("createdContinue")}
          </Button>
        </Modal>
      )}
    </div>
  );
}
