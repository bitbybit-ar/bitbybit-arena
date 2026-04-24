import { describe, it, expect } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { validateNip98AuthEvent } from "@/lib/nostr/verify";

const REQUEST_URL = "https://arena.bitbybit.com.ar/api/auth/nostr";
const REQUEST_METHOD = "POST";

/**
 * Round-trip a real kind:27235 NIP-98 event through the validator.
 * This file replaced the old NIP-42 (kind 22242) tests when we
 * migrated to NIP-98 — the previous incarnation also caught the
 * Hex64 vs Hex128 sig regression that broke login on the deploy.
 */
function signAuthEvent(
  opts: {
    url?: string;
    method?: string;
    createdAt?: number;
    content?: string;
    extraTags?: string[][];
    kind?: number;
  } = {}
) {
  const sk = generateSecretKey();
  const event = finalizeEvent(
    {
      kind: opts.kind ?? 27235,
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      tags: [
        ["u", opts.url ?? REQUEST_URL],
        ["method", opts.method ?? REQUEST_METHOD],
        ...(opts.extraTags ?? []),
      ],
      content: opts.content ?? "",
    },
    sk
  );
  return event;
}

describe("validateNip98AuthEvent", () => {
  it("accepts a freshly signed kind:27235 event whose u + method match", () => {
    const event = signAuthEvent();
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects with reason=schema when fields are missing", () => {
    const result = validateNip98AuthEvent(
      { pubkey: "a".repeat(64) },
      { url: REQUEST_URL, method: REQUEST_METHOD }
    );
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects with reason=schema when sig is 64 hex (the old buggy contract)", () => {
    // A Schnorr signature is 128 hex chars. Guard against any future
    // schema regression that types `sig` as Hex64.
    const fakeEvent = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      sig: "c".repeat(64), // wrong length
      created_at: Math.floor(Date.now() / 1000),
      kind: 27235,
      content: "",
      tags: [
        ["u", REQUEST_URL],
        ["method", REQUEST_METHOD],
      ],
    };
    const result = validateNip98AuthEvent(fakeEvent, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects with reason=kind when the event isn't kind 27235", () => {
    const event = signAuthEvent({ kind: 1 });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("kind");
  });

  it("rejects with reason=clock when created_at is more than 30s off", () => {
    const event = signAuthEvent({
      createdAt: Math.floor(Date.now() / 1000) - 5 * 60,
    });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("clock");
  });

  it("rejects with reason=content when content is non-empty (NIP-98 says empty)", () => {
    const event = signAuthEvent({ content: "not empty" });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("content");
  });

  it("rejects with reason=url when the u tag doesn't match the request URL", () => {
    const event = signAuthEvent({ url: "https://attacker.example/api/x" });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("url");
  });

  it("rejects with reason=method when the method tag doesn't match", () => {
    const event = signAuthEvent({ method: "GET" });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("method");
  });

  it("ignores trailing slashes and host case when matching the u tag", () => {
    const event = signAuthEvent({
      url: "https://ARENA.bitbybit.com.ar/api/auth/nostr/",
    });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(true);
  });

  it("preserves custom tags (e.g. arena_signer) on a successful validation", () => {
    const event = signAuthEvent({
      extraTags: [["arena_signer", "extension"]],
    });
    const result = validateNip98AuthEvent(event, {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const signerTag = result.event.tags.find((t) => t[0] === "arena_signer");
      expect(signerTag?.[1]).toBe("extension");
    }
  });
});
