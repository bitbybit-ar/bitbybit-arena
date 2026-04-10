"use client";

import type { ReactNode } from "react";
import { SignerProvider } from "@/lib/signer-context";
import { ReSignInModal } from "@/components/layout/ReSignInModal";

/**
 * Client wrapper that mounts SignerProvider and supplies the modal renderer.
 * Kept separate from the locale layout so the layout can stay a server
 * component. The modal is rendered unconditionally — it handles both
 * "reattach to existing session" and "full login" modes internally based
 * on whether a session exists when opened.
 */
export function SignerProviderClient({ children }: { children: ReactNode }) {
  return (
    <SignerProvider
      renderReSignInModal={({ open, onSigner, onCancel }) => (
        <ReSignInModal open={open} onSigner={onSigner} onCancel={onCancel} />
      )}
    >
      {children}
    </SignerProvider>
  );
}
