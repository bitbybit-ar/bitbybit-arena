"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/common/ImageUpload";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import type { VerificationMethod } from "@/lib/types";
import styles from "./checkpoint-submit-form.module.scss";

interface CheckpointSubmitFormProps {
  /** 1-based position, used for the form's aria-label only. */
  checkpointIndex: number;
  verificationMethods: VerificationMethod[];
  nostrActionTargetEventId: string | null;
  /** Controlled text + image proof. Parent owns the map keyed by id. */
  content: string;
  image: BlossomDescriptor | null;
  error?: string | null;
  loading: boolean;
  onContentChange: (next: string) => void;
  onImageChange: (next: BlossomDescriptor | null) => void;
  onSubmit: () => void;
}

/**
 * Per-checkpoint submission form. Branches on the primary verification
 * method: `nostr_action` renders a link to the target event + a single
 * verify button; everything else renders the manual text + image proof
 * form. State is controlled by the parent so map-wide cleanup (on
 * success, on success retry) stays in one place.
 */
export function CheckpointSubmitForm({
  checkpointIndex,
  verificationMethods,
  nostrActionTargetEventId,
  content,
  image,
  error,
  loading,
  onContentChange,
  onImageChange,
  onSubmit,
}: CheckpointSubmitFormProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");

  const primary = verificationMethods[0];
  const isNostrAction = primary === "nostr_action";
  const canSubmit = !loading && (isNostrAction || !!content.trim() || !!image);

  return (
    <div className={styles.actions}>
      {isNostrAction ? (
        <>
          {nostrActionTargetEventId && (
            <p className={styles.targetEventId}>
              <a
                href={`https://njump.me/${nostrActionTargetEventId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {nostrActionTargetEventId.slice(0, 16)}…
              </a>
            </p>
          )}
          <Button size="sm" onClick={onSubmit} disabled={loading}>
            {loading ? t("verifying") : t("verifyLikeButton")}
          </Button>
        </>
      ) : (
        <>
          <textarea
            className={styles.proofInput}
            placeholder={t("proofPlaceholder")}
            aria-label={t("checkpointProofLabel", { index: checkpointIndex })}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={2}
          />
          <div className={styles.inline}>
            <div className={styles.upload}>
              <ImageUpload
                value={image}
                onChange={onImageChange}
                alt={t("checkpointProofImageAlt", { index: checkpointIndex })}
                maxSizeMB={5}
              />
            </div>
            <Button
              className={styles.submit}
              size="sm"
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {loading ? t("submitting") : tCommon("submit")}
            </Button>
          </div>
        </>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
