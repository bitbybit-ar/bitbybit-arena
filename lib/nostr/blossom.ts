"use client";

/**
 * Blossom (BUD-01 / BUD-02) client-side upload helper.
 *
 * Blossom is a content-addressed blob store keyed by SHA-256. To upload a
 * file the client:
 *   1. hashes the file bytes with SHA-256
 *   2. builds an unsigned kind 24242 auth event tagging the sha256 + action
 *   3. signs it via the current Nostr signer
 *   4. PUTs the raw file bytes to <server>/upload with the signed event in
 *      the `Authorization: Nostr <base64(signedEventJson)>` header
 *
 * The server responds with a descriptor: { url, sha256, size, type, uploaded }.
 * We use that `url` everywhere we previously stored an arbitrary image URL
 * (badge images, proof photos, …) so uploads stay content-addressed and
 * future-portable — any Blossom server holding the blob can serve it.
 *
 * BitByBit defaults to a public Blossom server but callers can override via
 * NEXT_PUBLIC_BLOSSOM_SERVER at build time or by passing `serverUrl`.
 */

import type { NostrEvent, UnsignedNostrEvent } from "./types";

export type BlossomSignFn = (event: UnsignedNostrEvent) => Promise<NostrEvent>;

export interface BlossomDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
}

export type BlossomUploadErrorCode =
  | "empty_file"
  | "network"
  | "server_rejected"
  | "invalid_response"
  | "missing_url"
  | "auth_failed";

export class BlossomUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
    /**
     * Stable code for the client to translate via the locale bundle.
     * Defaults to "server_rejected" so legacy throw-sites stay roughly
     * accurate when the server returned a 4xx / 5xx.
     */
    public readonly code: BlossomUploadErrorCode = "server_rejected"
  ) {
    super(message);
    this.name = "BlossomUploadError";
  }
}

const DEFAULT_BLOSSOM_SERVER =
  process.env.NEXT_PUBLIC_BLOSSOM_SERVER ?? "https://blossom.primal.net";

const UPLOAD_AUTH_KIND = 24242;
// Auth event is short-lived: 5 min is plenty for a single PUT round-trip
// and keeps replay windows tight.
const AUTH_EXPIRATION_SECONDS = 5 * 60;

export function getDefaultBlossomServer(): string {
  return DEFAULT_BLOSSOM_SERVER;
}

/** Hex-encoded SHA-256 of the given bytes, computed via SubtleCrypto. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  // TS 5.7+ types `Uint8Array.buffer` as `ArrayBufferLike` (which includes
  // `SharedArrayBuffer`), while `crypto.subtle.digest` now wants strictly
  // `ArrayBuffer`. Allocate a fresh ArrayBuffer-backed view to widen the
  // type without runtime assertions.
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const input = new Uint8Array(new ArrayBuffer(source.byteLength));
  input.set(source);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const out = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < out.length; i++) {
    hex += out[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Build the unsigned kind 24242 upload-auth event per BUD-01.
 *
 * Exported for testing; callers usually go through `uploadToBlossom`.
 */
export function buildBlossomUploadAuth(params: {
  sha256: string;
  sizeBytes: number;
  filename?: string;
  now?: number;
}): UnsignedNostrEvent {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const tags: string[][] = [
    ["t", "upload"],
    ["x", params.sha256],
    ["expiration", String(now + AUTH_EXPIRATION_SECONDS)],
    ["size", String(params.sizeBytes)],
  ];
  return {
    kind: UPLOAD_AUTH_KIND,
    created_at: now,
    tags,
    content: params.filename
      ? `Upload ${params.filename}`
      : "Upload file",
  };
}

function encodeAuthHeader(signedEvent: unknown): string {
  const json = JSON.stringify(signedEvent);
  // btoa handles arbitrary unicode if we treat the JSON as Latin-1 after
  // UTF-8 percent-encoding round-trip. The auth event is ASCII-only so this
  // is safe, but do it defensively in case a filename has non-ASCII chars.
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `Nostr ${btoa(binary)}`;
}

/**
 * Upload a file to a Blossom server and return the descriptor.
 *
 * `sign` is any function that takes an unsigned event and returns a signed
 * one — usually `signWithPrompt` from the signer context so we get the
 * re-sign-in modal for free when no signer is attached.
 *
 * Throws `BlossomUploadError` on network or server failures.
 */
export async function uploadToBlossom(
  file: File,
  sign: BlossomSignFn,
  serverUrl: string = getDefaultBlossomServer()
): Promise<BlossomDescriptor> {
  if (!file.size) throw new BlossomUploadError("File is empty", undefined, undefined, "empty_file");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);

  const auth = buildBlossomUploadAuth({
    sha256,
    sizeBytes: file.size,
    filename: file.name,
  });
  const signed = await sign(auth);

  const url = serverUrl.replace(/\/+$/, "") + "/upload";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: encodeAuthHeader(signed),
        "Content-Type": file.type || "application/octet-stream",
      },
      body: bytes,
    });
  } catch (err) {
    throw new BlossomUploadError(
      "Network error uploading to Blossom",
      undefined,
      err,
      "network"
    );
  }

  if (!res.ok) {
    let detail = `Blossom server returned ${res.status}`;
    try {
      const text = await res.text();
      if (text) detail += `: ${text.slice(0, 200)}`;
    } catch {
      /* ignore */
    }
    throw new BlossomUploadError(detail, res.status, undefined, "server_rejected");
  }

  let descriptor: BlossomDescriptor;
  try {
    descriptor = (await res.json()) as BlossomDescriptor;
  } catch (err) {
    throw new BlossomUploadError(
      "Blossom server returned invalid JSON",
      res.status,
      err,
      "invalid_response"
    );
  }

  if (!descriptor.url || typeof descriptor.url !== "string") {
    throw new BlossomUploadError(
      "Blossom response is missing 'url'",
      undefined,
      undefined,
      "missing_url"
    );
  }
  return descriptor;
}
