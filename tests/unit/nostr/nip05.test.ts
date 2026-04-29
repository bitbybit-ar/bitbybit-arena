import { describe, it, expect, vi } from "vitest";
import { verifyNip05 } from "@/lib/nostr/nip05";

const PUBKEY = "a".repeat(64);
const OTHER_PUBKEY = "b".repeat(64);

function ok(json: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("verifyNip05", () => {
  it("verifies when the well-known endpoint returns the same pubkey", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ names: { alice: PUBKEY } }));

    const result = await verifyNip05("alice@example.com", PUBKEY, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBe(true);
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toBe(
      "https://example.com/.well-known/nostr.json?name=alice"
    );
  });

  it("rejects when the well-known endpoint returns a different pubkey", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ names: { alice: OTHER_PUBKEY } }));

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("treats bare domains as the `_` localpart (naked-domain form)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ names: { _: PUBKEY } }));

    const result = await verifyNip05("example.com", PUBKEY, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBe(true);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://example.com/.well-known/nostr.json?name=_"
    );
  });

  it("matches case-insensitively on both the returned pubkey and the localpart", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ names: { alice: PUBKEY.toUpperCase() } }));

    expect(
      await verifyNip05("Alice@Example.COM", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(true);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://example.com/.well-known/nostr.json?name=alice"
    );
  });

  it("returns false on a non-2xx response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404 }));

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("returns false when fetch rejects (network / CORS / DNS)", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("blocked"));

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("returns false on malformed JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("returns false when the response shape is missing `names`", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok({ relays: {} }));

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("returns false when the response omits the requested localpart", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ names: { bob: PUBKEY } }));

    expect(
      await verifyNip05("alice@example.com", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
  });

  it("rejects malformed input without making a network call", async () => {
    const fetchImpl = vi.fn();
    expect(
      await verifyNip05("not a nip05", PUBKEY, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
    expect(
      await verifyNip05("alice@example.com", "not-hex", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
