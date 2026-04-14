import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sha256Hex,
  buildBlossomUploadAuth,
  uploadToBlossom,
  BlossomUploadError,
} from "@/lib/nostr/blossom";
import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";

describe("sha256Hex", () => {
  it("returns the known SHA-256 of 'abc'", async () => {
    const bytes = new TextEncoder().encode("abc");
    // Known vector: https://en.wikipedia.org/wiki/SHA-2#Test_vectors
    const expected =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex(bytes)).toBe(expected);
  });

  it("handles empty input", async () => {
    const empty =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(await sha256Hex(new Uint8Array(0))).toBe(empty);
  });
});

describe("buildBlossomUploadAuth", () => {
  it("builds a kind 24242 upload auth event with the expected tags", () => {
    const event = buildBlossomUploadAuth({
      sha256: "deadbeef".repeat(8),
      sizeBytes: 12345,
      filename: "cat.png",
      now: 1_700_000_000,
    });

    expect(event.kind).toBe(24242);
    expect(event.created_at).toBe(1_700_000_000);

    const tagMap = new Map(event.tags.map((t) => [t[0], t.slice(1)]));
    expect(tagMap.get("t")).toEqual(["upload"]);
    expect(tagMap.get("x")?.[0]).toBe("deadbeef".repeat(8));
    expect(tagMap.get("size")).toEqual(["12345"]);
    // Expiration is in the future relative to created_at
    const expiration = Number(tagMap.get("expiration")?.[0]);
    expect(expiration).toBeGreaterThan(1_700_000_000);
    expect(event.content).toContain("cat.png");
  });
});

describe("uploadToBlossom", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // File and crypto.subtle are available under jsdom, so we only need
    // to stub the network.
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("signs an auth event, PUTs to /upload, and returns the descriptor", async () => {
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "proof.png", {
      type: "image/png",
    });

    const signMock = vi.fn(async (event: UnsignedNostrEvent): Promise<NostrEvent> => ({
      ...event,
      id: "x".repeat(64),
      pubkey: "p".repeat(64),
      sig: "s".repeat(128),
    }));

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          url: "https://blossom.example/abc123.png",
          sha256: "abc123",
          size: 3,
          type: "image/png",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const descriptor = await uploadToBlossom(
      fakeFile,
      signMock,
      "https://blossom.example"
    );

    expect(descriptor.url).toBe("https://blossom.example/abc123.png");
    expect(signMock).toHaveBeenCalledTimes(1);
    const signedArg = signMock.mock.calls[0][0];
    expect(signedArg.kind).toBe(24242);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(url).toBe("https://blossom.example/upload");
    expect(init.method).toBe("PUT");
    expect(headers.Authorization).toMatch(/^Nostr /);
    expect(headers["Content-Type"]).toBe("image/png");
  });

  it("throws BlossomUploadError on a non-2xx response", async () => {
    const fakeFile = new File([new Uint8Array([9])], "x.png", {
      type: "image/png",
    });
    const signMock = vi.fn(
      async (e: UnsignedNostrEvent): Promise<NostrEvent> => ({
        ...e,
        id: "i",
        pubkey: "p",
        sig: "s",
      })
    );
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 413 })
    ) as unknown as typeof fetch;

    await expect(
      uploadToBlossom(fakeFile, signMock, "https://blossom.example")
    ).rejects.toBeInstanceOf(BlossomUploadError);
  });

  it("rejects empty files without signing", async () => {
    const empty = new File([], "empty.png", { type: "image/png" });
    const signMock = vi.fn();
    await expect(
      uploadToBlossom(empty, signMock as never, "https://blossom.example")
    ).rejects.toBeInstanceOf(BlossomUploadError);
    expect(signMock).not.toHaveBeenCalled();
  });
});
