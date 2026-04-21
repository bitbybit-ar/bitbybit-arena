/**
 * Structured error emitted by the shared Nostr auth components
 * (ExtensionSignerButton, NsecSignerForm, NostrConnectPanel) instead
 * of a bare i18n key string. Carries the namespace so consumers can
 * dispatch to the correct `useTranslations` without try/catch or
 * hand-maintained key sets.
 */
export type AuthError =
  | { namespace: "login"; key: LoginErrorKey }
  | { namespace: "reSignIn"; key: ReSignInErrorKey };

/** Keys defined under the `login` namespace in `messages/*.json`. */
export type LoginErrorKey =
  | "no_extension"
  | "nostr_signing_rejected"
  | "nsecInvalidKey"
  | "connectError"
  | "rate_limited"
  | "error";

/** Keys defined under the `reSignIn` namespace. */
export type ReSignInErrorKey =
  | "extensionRejected"
  | "mismatch"
  | "authFailed";

/** Factory for `login` namespace errors. Narrows the key at the call site. */
export const loginError = (key: LoginErrorKey): AuthError => ({
  namespace: "login",
  key,
});

/** Factory for `reSignIn` namespace errors. */
export const reSignInError = (key: ReSignInErrorKey): AuthError => ({
  namespace: "reSignIn",
  key,
});

/**
 * Tell whether a signer failure was a deliberate cancellation rather than
 * an unexpected error. Used by sign-then-persist flows that want to bail
 * silently on cancel but still surface real errors to the user.
 *
 * Two sources to recognise:
 *   1. Our own re-sign-in modal rejects with sentinel messages
 *      (`re_sign_in_cancelled`, `re_sign_in_superseded`) when the user
 *      closes it or another prompt supersedes it.
 *   2. NIP-07 extensions throw plain Errors whose message contains
 *      "rejected" / "denied" / "cancel" when the user clicks Reject.
 *      Extension vendors don't standardise the wording, so this is a
 *      best-effort substring match — same heuristic used in
 *      ExtensionSignerButton.
 */
export function isSignerCancellation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg === "re_sign_in_cancelled" ||
    msg === "re_sign_in_superseded" ||
    msg.includes("rejected") ||
    msg.includes("denied") ||
    msg.includes("cancel")
  );
}
