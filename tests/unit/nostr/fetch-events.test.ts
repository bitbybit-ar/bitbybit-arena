import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NostrEvent } from "@/lib/nostr/types";

// Mock signature verification so we control match semantics without real keys.
vi.mock("@/lib/nostr/verify", () => ({
  verifyNostrEvent: vi.fn(() => true),
}));

// Provide a controllable fake WebSocket global. Vitest runs this file under
// jsdom by default, which doesn't expose a Node-style WebSocket anyway.
interface FakeSocket {
  url: string;
  sent: string[];
  _listeners: Record<string, ((event: { data?: unknown }) => void)[]>;
  addEventListener(evt: string, cb: (event: { data?: unknown }) => void): void;
  send(data: string): void;
  close(): void;
  // Test helpers (not on the real WebSocket API)
  _emit(evt: string, data?: unknown): void;
}

const sockets: FakeSocket[] = [];

class FakeWebSocket implements FakeSocket {
  url: string;
  sent: string[] = [];
  _listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
  addEventListener(evt: string, cb: (event: { data?: unknown }) => void) {
    (this._listeners[evt] ||= []).push(cb);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this._emit("close");
  }
  _emit(evt: string, data?: unknown) {
    for (const cb of this._listeners[evt] || []) cb({ data });
  }
}

// Relays module provides the default list. Override per-test.
vi.mock("@/lib/nostr/relays", () => ({
  DEFAULT_RELAYS: ["wss://relay-a", "wss://relay-b"],
}));

const { fetchFirstMatchingEvent } = await import("@/lib/nostr/fetch-events");

describe("fetchFirstMatchingEvent", () => {
  let originalWS: typeof globalThis.WebSocket | undefined;

  beforeEach(() => {
    sockets.length = 0;
    originalWS = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
    vi.useRealTimers();
  });

  const sampleEvent: NostrEvent = {
    id: "abc123",
    pubkey: "pk",
    created_at: 0,
    kind: 7,
    tags: [["e", "target"]],
    content: "+",
    sig: "sig",
  };

  it("sends a REQ to every relay on open and resolves on first EVENT match", async () => {
    const promise = fetchFirstMatchingEvent({ kinds: [7] }, { timeoutMs: 5000 });

    // Drive both sockets through their open handshake
    sockets.forEach((s) => s._emit("open"));

    // Both should have issued a REQ
    expect(sockets).toHaveLength(2);
    for (const s of sockets) {
      expect(s.sent).toHaveLength(1);
      const parsed = JSON.parse(s.sent[0]);
      expect(parsed[0]).toBe("REQ");
      expect(parsed[2]).toEqual({ kinds: [7] });
    }

    // First relay returns a matching EVENT
    sockets[0]._emit("message", JSON.stringify(["EVENT", "sub", sampleEvent]));

    const result = await promise;
    expect(result).toEqual(sampleEvent);
  });

  it("resolves null when every relay closes without a match", async () => {
    const promise = fetchFirstMatchingEvent({ kinds: [7] }, { timeoutMs: 5000 });
    sockets.forEach((s) => s._emit("open"));

    // Both relays send EOSE then close
    for (const s of sockets) {
      s._emit("message", JSON.stringify(["EOSE", "sub"]));
      s._emit("close");
    }

    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves null on timeout", async () => {
    const promise = fetchFirstMatchingEvent({ kinds: [7] }, { timeoutMs: 1000 });
    sockets.forEach((s) => s._emit("open"));

    vi.advanceTimersByTime(1000);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("skips events that fail signature verification", async () => {
    const { verifyNostrEvent } = await import("@/lib/nostr/verify");
    (verifyNostrEvent as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => false);

    const promise = fetchFirstMatchingEvent({ kinds: [7] }, { timeoutMs: 1000 });
    sockets.forEach((s) => s._emit("open"));

    // First relay sends an event that fails verification
    sockets[0]._emit("message", JSON.stringify(["EVENT", "sub", sampleEvent]));
    // Second relay sends the same event (verify now returns true)
    sockets[1]._emit("message", JSON.stringify(["EVENT", "sub", sampleEvent]));

    const result = await promise;
    expect(result).toEqual(sampleEvent);
  });

  it("skips events that fail the optional predicate and waits for a matching one", async () => {
    const wrongTag: NostrEvent = {
      ...sampleEvent,
      id: "no-match",
      tags: [["t", "other"]],
    };
    const rightTag: NostrEvent = {
      ...sampleEvent,
      id: "match",
      tags: [["t", "PizzaDay"]],
    };

    const promise = fetchFirstMatchingEvent(
      { kinds: [1] },
      {
        timeoutMs: 5000,
        predicate: (event) =>
          event.tags.some(
            (t) => t[0] === "t" && t[1]?.toLowerCase() === "pizzaday"
          ),
      }
    );
    sockets.forEach((s) => s._emit("open"));

    // First relay sends an event that fails the predicate (different tag)
    sockets[0]._emit("message", JSON.stringify(["EVENT", "sub", wrongTag]));
    // Second relay sends an event that matches case-insensitively
    sockets[1]._emit("message", JSON.stringify(["EVENT", "sub", rightTag]));

    const result = await promise;
    expect(result).toEqual(rightTag);
  });
});
