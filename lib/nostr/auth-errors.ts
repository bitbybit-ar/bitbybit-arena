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
