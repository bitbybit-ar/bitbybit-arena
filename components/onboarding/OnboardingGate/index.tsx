"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/contexts/session-context";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";

// Session-scoped sentinel so dismissing the welcome modal once per tab
// doesn't re-open it after every client-side route change. We deliberately
// use sessionStorage (not localStorage) so a fresh sign-in on a new device
// still triggers the welcome flow until the user actually completes the
// profile or hits Skip — which writes the sentinel for the rest of the
// tab's lifetime.
const DISMISSED_KEY = "arena.onboarding.dismissed";

// Mounts the welcome modal exactly once per session for users whose
// profile is still on the `Nostr <pubkey-prefix>` placeholder. Mounted
// at the (app) layout so it covers /explore, /create, /my-challenges,
// and /settings — anywhere a freshly-signed-in user might land.
export function OnboardingGate() {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (user.profile_completed) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISSED_KEY) === "1") return;
    setOpen(true);
  }, [user, loading]);

  const handleClose = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    }
  };

  if (!open) return null;
  return <WelcomeModal onClose={handleClose} />;
}
