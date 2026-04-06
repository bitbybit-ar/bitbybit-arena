"use client";

import { useState, useEffect, useCallback } from "react";
import type { NostrMetadata } from "@/lib/nostr/types";
import { fetchNostrMetadata } from "@/lib/nostr/metadata";

interface NostrLoginResult {
  success: boolean;
  error?: string;
}

interface UseNostrReturn {
  hasExtension: boolean;
  login: () => Promise<NostrLoginResult>;
  fetchAndSyncMetadata: (pubkey: string) => Promise<NostrMetadata | null>;
  isLoading: boolean;
}

export function useNostr(): UseNostrReturn {
  const [hasExtension, setHasExtension] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const check = () => setHasExtension(!!window.nostr);
    // Extension may load after page — check with delay
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

  const performChallengeResponse = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!window.nostr) {
      return { success: false, error: "no_extension" };
    }

    // Step 1: Get challenge from server
    const challengeRes = await fetch("/api/auth/nostr", { method: "GET" });
    if (!challengeRes.ok) {
      return { success: false, error: "challenge_failed" };
    }
    const { data: challenge } = await challengeRes.json();

    // Step 2: Sign kind 22242 event with NIP-07
    let signedEvent;
    try {
      const pubkey = await window.nostr.getPublicKey();
      const event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: challenge,
      };
      signedEvent = await window.nostr.signEvent(event);
      signedEvent.pubkey = pubkey;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("rejected") || msg.includes("denied")) {
        return { success: false, error: "nostr_signing_rejected" };
      }
      return { success: false, error: "no_signing_key" };
    }

    // Step 3: Send signed event for verification
    const authRes = await fetch("/api/auth/nostr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    });

    if (!authRes.ok) {
      const body = await authRes.json().catch(() => ({}));
      return { success: false, error: body.error || "auth_failed" };
    }

    return { success: true };
  }, []);

  const login = useCallback(async (): Promise<NostrLoginResult> => {
    setIsLoading(true);
    try {
      return await performChallengeResponse();
    } finally {
      setIsLoading(false);
    }
  }, [performChallengeResponse]);

  const fetchAndSyncMetadata = useCallback(
    async (pubkey: string): Promise<NostrMetadata | null> => {
      try {
        return await fetchNostrMetadata(pubkey);
      } catch {
        return null;
      }
    },
    []
  );

  return { hasExtension, login, fetchAndSyncMetadata, isLoading };
}
