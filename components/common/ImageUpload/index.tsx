"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSignerContext } from "@/lib/signer-context";
import {
  uploadToBlossom,
  BlossomUploadError,
  type BlossomDescriptor,
} from "@/lib/nostr/blossom";
import styles from "./image-upload.module.scss";

interface ImageUploadProps {
  value: BlossomDescriptor | null;
  onChange: (next: BlossomDescriptor | null) => void;
  /** Max file size in megabytes. Default 5. */
  maxSizeMB?: number;
  /** Accepted MIME types (comma-separated). Default image/*. */
  accept?: string;
  /** Input id, used by label htmlFor. */
  id?: string;
  /**
   * Alt text shown on the preview image. Required for non-decorative
   * uploads (badge images, completion proofs) so screen readers announce
   * what the user just attached. The default is the namespaced
   * `imageUpload.previewAlt` ("Uploaded image preview") rather than an
   * empty string — the previous default `alt=""` silently hid uploaded
   * proofs from assistive tech across every caller.
   */
  alt?: string;
}

const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export function ImageUpload({
  value,
  onChange,
  maxSizeMB = 5,
  accept = "image/*",
  id,
  alt,
}: ImageUploadProps) {
  const t = useTranslations("imageUpload");
  const previewAlt = alt && alt.trim().length > 0 ? alt : t("previewAlt");
  const { signWithPrompt } = useSignerContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => inputRef.current?.click();

  const handleClear = () => {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const tErrors = useTranslations("imageUpload.errors");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError(t("invalidType"));
      return;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(t("tooLarge", { max: maxSizeMB }));
      return;
    }

    setUploading(true);
    try {
      const descriptor = await uploadToBlossom(file, signWithPrompt);
      onChange(descriptor);
    } catch (err) {
      // Translate by stable code rather than surfacing the English
      // `err.message` directly. The Spanish UI used to render
      // "Network error uploading to Blossom" verbatim — now it gets
      // "No pudimos conectar con el servidor de imágenes…".
      if (err instanceof BlossomUploadError) {
        try {
          setError(tErrors(err.code));
        } catch {
          setError(t("uploadFailed"));
        }
      } else {
        setError(t("uploadFailed"));
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className={styles.hiddenInput}
        disabled={uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className={styles.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt={previewAlt}
            className={styles.previewImage}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
          />
          <div className={styles.previewActions}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={handlePick}
              disabled={uploading}
            >
              {uploading ? t("uploading") : t("replace")}
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={handleClear}
              disabled={uploading}
            >
              {t("remove")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.dropzone}
          onClick={handlePick}
          disabled={uploading}
          aria-busy={uploading}
        >
          <span className={styles.dropzoneTitle}>
            {uploading ? t("uploading") : t("chooseFile")}
          </span>
          <span className={styles.dropzoneHint}>
            {t("hint", { max: maxSizeMB })}
          </span>
        </button>
      )}

      {/*
        Indeterminate progress bar while the Blossom upload runs.
        Blossom's HTTP API doesn't stream progress events back so a
        true percentage isn't available — the indeterminate stripe is
        an honest signal that something is happening without lying
        about how far along it is. role="progressbar" announces the
        busy state to screen readers.
      */}
      {uploading && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-busy="true"
          aria-label={t("uploading")}
        >
          <div className={styles.progressBar} />
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
