/**
 * Unit tests for the LNURL-pay client used by the Zap modal.
 *
 * `fetchLnurlPayEndpoint` and `fetchInvoice` both wrap `fetch()` and
 * throw a typed `LnurlError` with a stable `code` for each failure
 * mode — that's what the client maps to the locale bundle, so we lock
 * down the codes here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LnurlError,
  fetchInvoice,
  fetchLnurlPayEndpoint,
} from "@/lib/nostr/lnurl";

function mockFetch(impl: (url: string) => unknown) {
  return vi.fn(async (url: unknown) => {
    const result = impl(String(url));
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchLnurlPayEndpoint", () => {
  it("hits the .well-known/lnurlp/<user> URL for a valid Lightning address", async () => {
    const fetchSpy = mockFetch(() => ({
      tag: "payRequest",
      callback: "https://wallet.example/cb/1",
      minSendable: 1000,
      maxSendable: 1_000_000_000,
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchLnurlPayEndpoint("alice@wallet.example");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://wallet.example/.well-known/lnurlp/alice"
    );
    expect(result.callback).toBe("https://wallet.example/cb/1");
  });

  it("throws lnurl_invalid_address when the input is not user@domain", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchLnurlPayEndpoint("not-an-address")).rejects.toThrow(
      LnurlError
    );
    await expect(fetchLnurlPayEndpoint("not-an-address")).rejects.toMatchObject(
      { code: "lnurl_invalid_address" }
    );
  });

  it("throws lnurl_endpoint_failed when the endpoint returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 }))
    );
    await expect(
      fetchLnurlPayEndpoint("alice@wallet.example")
    ).rejects.toMatchObject({ code: "lnurl_endpoint_failed" });
  });

  it("throws lnurl_invalid_response when tag is not 'payRequest'", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({ tag: "withdrawRequest" }))
    );
    await expect(
      fetchLnurlPayEndpoint("alice@wallet.example")
    ).rejects.toMatchObject({ code: "lnurl_invalid_response" });
  });
});

describe("fetchInvoice", () => {
  const callback = "https://wallet.example/cb/1";

  it("appends amount in millisats and returns the BOLT11 invoice", async () => {
    const fetchSpy = mockFetch((url) => {
      const u = new URL(url);
      expect(u.searchParams.get("amount")).toBe("21000"); // 21 sats * 1000
      return { pr: "lnbc1abc" };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const invoice = await fetchInvoice(callback, 21);
    expect(invoice).toBe("lnbc1abc");
  });

  it("attaches the `comment` query param when provided", async () => {
    const fetchSpy = mockFetch((url) => {
      const u = new URL(url);
      expect(u.searchParams.get("comment")).toBe("nice work");
      return { pr: "lnbc1abc" };
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchInvoice(callback, 21, "nice work");
  });

  it("attaches a JSON-stringified zap request as the `nostr` query param", async () => {
    const zapReq = { kind: 9734, content: "" };
    const fetchSpy = mockFetch((url) => {
      const u = new URL(url);
      expect(u.searchParams.get("nostr")).toBe(JSON.stringify(zapReq));
      return { pr: "lnbc1abc" };
    });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchInvoice(callback, 21, undefined, zapReq);
  });

  it("throws lnurl_invoice_failed on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    await expect(fetchInvoice(callback, 21)).rejects.toMatchObject({
      code: "lnurl_invoice_failed",
    });
  });

  it("throws lnurl_no_invoice when the response is missing `pr`", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({}))
    );
    await expect(fetchInvoice(callback, 21)).rejects.toMatchObject({
      code: "lnurl_no_invoice",
    });
  });
});
