"use client";

/**
 * SignerProvider — tracks the in-memory Nostr signer for the current session.
 *
 * The session cookie (httpOnly JWT) is the source of truth for "is this user
 * authenticated against Arena's API". The signer here is independent: it's
 * the thing that can sign new Nostr events (challenge publishes, joins,
 * completions, badge awards) on behalf of the user.
 *
 * On reload:
 *  - Extension users auto-restore (window.nostr is always available).
 *  - nsec / NIP-46 users lose their signer and must re-attach via the
 *    ReSignInModal before performing any signing action.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";
import {
  type SignerHandle,
  makeExtensionSigner,
} from "@/lib/nostr/signers";

interface SessionInfo {
  user_id: string;
  nostr_pubkey: string;
  display_name: string;
  username: string;
}

interface SignerContextValue {
  /** httpOnly cookie session — null if user is signed out. */
  session: SessionInfo | null;
  /** True until the initial session fetch resolves. */
  sessionLoading: boolean;
  /** In-memory signer, or null if signing is currently impossible. */
  signer: SignerHandle | null;
  /**
   * True when the user has a valid session cookie but no signer in memory.
   * (Typical case: reload after nsec/NIP-46 login.)
   */
  needsReSignIn: boolean;
  /**
   * True whenever the app can't sign — either anonymous user OR
   * a logged-in user whose signer isn't in memory. UI should gate
   * signing actions on this and offer the signer modal.
   */
  needsSigner: boolean;
  setSigner: (signer: SignerHandle) => void;
  clearSigner: () => Promise<void>;
  refreshSession: () => Promise<void>;
  /**
   * Run the NIP-42 challenge/response flow using the given signer and,
   * on success, store the signer and refresh the session. Returns true
   * on success. Used by the login mode of the signer modal.
   */
  completeLoginWithSigner: (signer: SignerHandle) => Promise<boolean>;
  /**
   * Open the signer modal and resolve with the new signer once the user
   * completes either the reattach flow (session exists) or the full
   * login flow (session missing). Rejects if the user closes the modal.
   */
  requestReSignIn: () => Promise<SignerHandle>;
  /**
   * Sign and return an event using whatever signer is currently in memory.
   * If no signer is available, opens the signer modal first.
   */
  signWithPrompt: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
}

const SignerContext = createContext<SignerContextValue | null>(null);

export function useSignerContext(): SignerContextValue {
  const ctx = useContext(SignerContext);
  if (!ctx) throw new Error("useSignerContext must be used within SignerProvider");
  return ctx;
}

interface PendingPrompt {
  resolve: (signer: SignerHandle) => void;
  reject: (err: Error) => void;
}

interface SignerProviderProps {
  children: ReactNode;
  /** Renders the modal UI; controlled by `open` + callbacks. */
  renderReSignInModal: (props: {
    open: boolean;
    onSigner: (signer: SignerHandle) => void;
    onCancel: () => void;
  }) => ReactNode;
}

export function SignerProvider({
  children,
  renderReSignInModal,
}: SignerProviderProps) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [signer, setSignerState] = useState<SignerHandle | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingPromptRef = useRef<PendingPrompt | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (!res.ok) {
        setSession(null);
        return;
      }
      const json = await res.json();
      if (json.success && json.data?.user_id) {
        setSession({
          user_id: json.data.user_id,
          nostr_pubkey: json.data.nostr_pubkey,
          display_name: json.data.display_name,
          username: json.data.username,
        });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Auto-restore extension signer when session is valid and window.nostr is
  // present. The extension is the only signer that survives reloads, because
  // the key lives in the extension itself, not in our app memory.
  useEffect(() => {
    if (!session || signer) return;

    let cancelled = false;
    const tryAttach = async () => {
      if (typeof window === "undefined" || !window.nostr) return;
      try {
        const pk = await window.nostr.getPublicKey();
        if (cancelled) return;
        if (pk === session.nostr_pubkey) {
          setSignerState(makeExtensionSigner(pk));
        }
      } catch {
        /* extension declined or unavailable — leave signer null */
      }
    };

    // Extensions can inject window.nostr asynchronously after page load.
    tryAttach();
    const timer = setTimeout(tryAttach, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, signer]);

  const setSigner = useCallback((next: SignerHandle) => {
    setSignerState((prev) => {
      if (prev && prev !== next) prev.close?.();
      return next;
    });
  }, []);

  const clearSigner = useCallback(async () => {
    setSignerState((prev) => {
      prev?.close?.();
      return null;
    });
    setSession(null);
  }, []);

  const closePrompt = useCallback((err?: Error) => {
    setModalOpen(false);
    if (pendingPromptRef.current && err) {
      pendingPromptRef.current.reject(err);
    }
    pendingPromptRef.current = null;
  }, []);

  const requestReSignIn = useCallback((): Promise<SignerHandle> => {
    return new Promise<SignerHandle>((resolve, reject) => {
      // Reject any prior pending call so callers don't leak. The single
      // modal can only service one prompt at a time.
      pendingPromptRef.current?.reject(
        new Error("re_sign_in_superseded")
      );
      pendingPromptRef.current = { resolve, reject };
      setModalOpen(true);
    });
  }, []);

  const completeLoginWithSigner = useCallback(
    async (next: SignerHandle): Promise<boolean> => {
      try {
        const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
        if (!challengeRes.ok) return false;
        const { data: challenge } = await challengeRes.json();

        const signed = await next.sign({
          kind: 22242,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: challenge,
        });

        const authRes = await fetch("/api/auth/nostr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedEvent: signed }),
        });
        if (!authRes.ok) return false;

        setSigner(next);
        await refreshSession();
        return true;
      } catch {
        return false;
      }
    },
    [setSigner, refreshSession]
  );

  const handleModalSigner = useCallback((next: SignerHandle) => {
    // The modal itself has already run either the reattach check or the
    // NIP-42 login flow (which already called setSigner). We just close
    // the modal and resolve the pending promise here.
    const pending = pendingPromptRef.current;
    pendingPromptRef.current = null;
    setModalOpen(false);
    pending?.resolve(next);
  }, []);

  const handleModalCancel = useCallback(() => {
    closePrompt(new Error("re_sign_in_cancelled"));
  }, [closePrompt]);

  const signWithPrompt = useCallback(
    async (event: UnsignedNostrEvent): Promise<NostrEvent> => {
      let active = signer;
      if (!active) {
        active = await requestReSignIn();
      }
      return active.sign(event);
    },
    [signer, requestReSignIn]
  );

  const needsReSignIn = !!session && !signer && !sessionLoading;
  const needsSigner = !signer && !sessionLoading;

  const value = useMemo<SignerContextValue>(
    () => ({
      session,
      sessionLoading,
      signer,
      needsReSignIn,
      needsSigner,
      setSigner,
      clearSigner,
      refreshSession,
      completeLoginWithSigner,
      requestReSignIn,
      signWithPrompt,
    }),
    [
      session,
      sessionLoading,
      signer,
      needsReSignIn,
      needsSigner,
      setSigner,
      clearSigner,
      refreshSession,
      completeLoginWithSigner,
      requestReSignIn,
      signWithPrompt,
    ]
  );

  return (
    <SignerContext.Provider value={value}>
      {children}
      {renderReSignInModal({
        open: modalOpen,
        onSigner: handleModalSigner,
        onCancel: handleModalCancel,
      })}
    </SignerContext.Provider>
  );
}
