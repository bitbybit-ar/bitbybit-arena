"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/common/ImageUpload";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import styles from "./checkpoint-submit-form.module.scss";

/**
 * Discriminated on `mode`. The nostr-action branch is a single verify
 * button against a target event; the manual branch is textarea +
 * Blossom image upload + submit. Splitting the prop shape means the
 * type system enforces "don't pass content/image to the verify-only
 * flow" at the call site.
 */
type CheckpointSubmitFormProps = {
  /** 1-based position, used for the form's aria-label only. */
  checkpointIndex: number;
  error?: string | null;
  loading: boolean;
  onSubmit: () => void;
} & (
  | {
      mode: "nostr-action";
      nostrActionTargetEventId: string | null;
    }
  | {
      mode: "manual";
      content: string;
      image: BlossomDescriptor | null;
      onContentChange: (next: string) => void;
      onImageChange: (next: BlossomDescriptor | null) => void;
    }
);

export function CheckpointSubmitForm(props: CheckpointSubmitFormProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");

  const { checkpointIndex, error, loading, onSubmit } = props;

  if (props.mode === "nostr-action") {
    return (
      <div className={styles.actions}>
        {props.nostrActionTargetEventId && (
          <p className={styles.targetEventId}>
            <a
              href={`https://njump.me/${props.nostrActionTargetEventId}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {props.nostrActionTargetEventId.slice(0, 16)}…
            </a>
          </p>
        )}
        <Button size="sm" onClick={onSubmit} disabled={loading}>
          {loading ? t("verifying") : t("verifyLikeButton")}
        </Button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  const { content, image, onContentChange, onImageChange } = props;
  const canSubmit = !loading && (!!content.trim() || !!image);

  return (
    <div className={styles.actions}>
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
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
