/**
 * LNURL-pay utilities for fetching Lightning invoices.
 * Used by the Zap modal to request invoices from a Lightning address.
 */

interface LnurlPayResponse {
  callback: string;
  minSendable: number; // millisats
  maxSendable: number; // millisats
  tag: string;
}

interface LnurlInvoiceResponse {
  pr: string; // BOLT11 payment request
}

export type LnurlErrorCode =
  | "lnurl_invalid_address"
  | "lnurl_endpoint_failed"
  | "lnurl_invalid_response"
  | "lnurl_invoice_failed"
  | "lnurl_no_invoice";

// Throws a stable, locale-neutral `code` so callers can translate to
// the active locale instead of leaking English to the user.
export class LnurlError extends Error {
  constructor(public readonly code: LnurlErrorCode) {
    super(code);
    this.name = "LnurlError";
  }
}

/**
 * Resolve a Lightning address (user@domain) to its LNURL-pay endpoint metadata.
 */
export async function fetchLnurlPayEndpoint(lightningAddress: string): Promise<LnurlPayResponse> {
  const [user, domain] = lightningAddress.split("@");
  if (!user || !domain) {
    throw new LnurlError("lnurl_invalid_address");
  }

  const url = `https://${domain}/.well-known/lnurlp/${user}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new LnurlError("lnurl_endpoint_failed");
  }

  const data = await res.json();

  if (data.tag !== "payRequest") {
    throw new LnurlError("lnurl_invalid_response");
  }

  return data as LnurlPayResponse;
}

/**
 * Request a BOLT11 invoice from an LNURL-pay callback.
 * @param callback - The LNURL-pay callback URL
 * @param amountSats - Amount in sats
 * @param comment - Optional zap comment
 * @param zapRequest - Optional signed NIP-57 kind 9734 event. When provided,
 *                    attached via the `nostr` query parameter so the
 *                    recipient's node emits a kind 9735 zap receipt.
 */
export async function fetchInvoice(
  callback: string,
  amountSats: number,
  comment?: string,
  zapRequest?: unknown
): Promise<string> {
  const url = new URL(callback);
  url.searchParams.set("amount", String(amountSats * 1000)); // millisats

  if (comment) {
    url.searchParams.set("comment", comment);
  }

  if (zapRequest) {
    url.searchParams.set("nostr", JSON.stringify(zapRequest));
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new LnurlError("lnurl_invoice_failed");
  }

  const data: LnurlInvoiceResponse = await res.json();

  if (!data.pr) {
    throw new LnurlError("lnurl_no_invoice");
  }

  return data.pr;
}
