/**
 * Unified signer interface for in-memory Nostr signing.
 *
 * The login flow produces one of three signer types (extension, nsec,
 * nip46). After auth, we keep a `SignerHandle` in memory so subsequent
 * actions (publishing challenges, joins, completions, badge awards) can
 * be signed without re-prompting the user. None of these handles persist
 * across reloads — see SignerProvider for the auto-restore policy.
 */

import { finalizeEvent } from "nostr-tools/pure";
import type { BunkerSigner } from "nostr-tools/nip46";
import type { NostrEvent, UnsignedNostrEvent } from "./types";

export type SignerType = "extension" | "nsec" | "nip46";

export interface SignerHandle {
  type: SignerType;
  pubkey: string;
  sign: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
  close?: () => Promise<void>;
}

export function makeExtensionSigner(pubkey: string): SignerHandle {
  return {
    type: "extension",
    pubkey,
    sign: async (event) => {
      if (!window.nostr) throw new Error("no_extension");
      const signed = await window.nostr.signEvent(event);
      return { ...signed, pubkey };
    },
  };
}

export function makeNsecSigner(
  secretKey: Uint8Array,
  pubkey: string
): SignerHandle {
  return {
    type: "nsec",
    pubkey,
    sign: async (event) => {
      const signed = finalizeEvent(event, secretKey);
      return {
        id: signed.id,
        pubkey,
        created_at: signed.created_at,
        kind: signed.kind,
        tags: signed.tags,
        content: signed.content,
        sig: signed.sig,
      };
    },
  };
}

export function makeNip46Signer(
  bunker: BunkerSigner,
  pubkey: string
): SignerHandle {
  return {
    type: "nip46",
    pubkey,
    sign: async (event) => {
      const signed = await bunker.signEvent(event);
      return {
        id: signed.id,
        pubkey: signed.pubkey,
        created_at: signed.created_at,
        kind: signed.kind,
        tags: signed.tags,
        content: signed.content,
        sig: signed.sig,
      };
    },
    close: async () => {
      try {
        await bunker.close();
      } catch {
        /* ignore */
      }
    },
  };
}
