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

/**
 * Resolve a Lightning address (user@domain) to its LNURL-pay endpoint metadata.
 */
export async function fetchLnurlPayEndpoint(lightningAddress: string): Promise<LnurlPayResponse> {
  const [user, domain] = lightningAddress.split("@");
  if (!user || !domain) {
    throw new Error("Invalid Lightning address");
  }

  const url = `https://${domain}/.well-known/lnurlp/${user}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch LNURL-pay endpoint");
  }

  const data = await res.json();

  if (data.tag !== "payRequest") {
    throw new Error("Invalid LNURL-pay response");
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
    throw new Error("Failed to fetch invoice");
  }

  const data: LnurlInvoiceResponse = await res.json();

  if (!data.pr) {
    throw new Error("No invoice returned");
  }

  return data.pr;
}
