"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Section, SectionTitle } from "@/components/common/Section";
import type { ChallengeDetail } from "./types";
import styles from "./challenge-detail.module.scss";

type NostrVerifyMethod = "nostr_action" | "nostr_hashtag";

interface NostrVerifySectionProps {
  challenge: ChallengeDetail;
  actionLoading: string | null;
  verifyError: string | null;
  onVerify: (method: NostrVerifyMethod) => void | Promise<void>;
  onClearError: () => void;
}

type Variant = "action" | "hashtag";

interface VariantBlockProps extends NostrVerifySectionProps {
  variant: Variant;
}

// Single-variant Section. Both variants hit the same `/completions`
// endpoint; the only differences are copy, the deep-link target, and
// the `method` we tell the server to run — the server can't infer it
// when a challenge advertises more than one verification method.
function VariantBlock({
  challenge,
  actionLoading,
  verifyError,
  onVerify,
  onClearError,
  variant,
}: VariantBlockProps) {
  const t = useTranslations("challenge");
  const method: NostrVerifyMethod =
    variant === "action" ? "nostr_action" : "nostr_hashtag";
  const loading = actionLoading === `verify_${method}`;

  // Defensive guard: if a challenge somehow has the verification
  // method enabled but the matching target value is missing
  // (historical row, manual DB edit), don't render a block whose
  // copy and deep-link would be malformed. The create-flow Zod
  // schema enforces these as required, so this only catches drift.
  if (variant === "hashtag" && !challenge.nostr_hashtag) return null;
  if (variant === "action" && !challenge.nostr_action_target_event_id)
    return null;

  const title =
    variant === "action" ? t("verifyLikeTitle") : t("verifyHashtagTitle");
  const instructions =
    variant === "action"
      ? t("verifyLikeInstructions")
      : t("verifyHashtagInstructions", {
          hashtag: challenge.nostr_hashtag ?? "",
        });
  const buttonLabel =
    variant === "action" ? t("verifyLikeButton") : t("verifyHashtagButton");
  const retryLabel =
    variant === "action" ? t("verifyLikeRetry") : t("verifyHashtagRetry");

  return (
    <Section>
      <SectionTitle>{title}</SectionTitle>
      <p className={styles.emptyText}>{instructions}</p>
      {variant === "action" && challenge.nostr_action_target_event_id && (
        <p className={styles.targetEventId}>
          <a
            href={`https://njump.me/${challenge.nostr_action_target_event_id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {challenge.nostr_action_target_event_id.slice(0, 16)}…
          </a>
        </p>
      )}
      {variant === "hashtag" && challenge.nostr_hashtag && (
        <p className={styles.targetEventId}>
          <a
            href={`https://nostr.band/?q=${encodeURIComponent(`#${challenge.nostr_hashtag}`)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            #{challenge.nostr_hashtag}
          </a>
        </p>
      )}
      <Button size="sm" onClick={() => onVerify(method)} disabled={loading}>
        {loading ? t("verifying") : buttonLabel}
      </Button>
      {verifyError && (
        // Pair the error message with an inline retry button so a
        // transient relay miss doesn't require scrolling back up to
        // find the primary CTA again. The button reuses the same
        // handler — the user just clicks once more after they've made
        // sure the proof is actually published from their Nostr client.
        <div className={styles.verifyErrorBlock}>
          <p className={styles.error}>{verifyError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onClearError();
              void onVerify(method);
            }}
            disabled={loading}
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </Section>
  );
}

// Participant-facing verify affordance for Nostr-only challenges.
// Renders one Section per matching method on the challenge — for the
// rare dual-method case, both blocks render side-by-side and the
// participant picks which proof path to follow.
export function NostrVerifySection(props: NostrVerifySectionProps) {
  if (props.challenge.checkpoint_mode !== "none") return null;
  const methods = props.challenge.verification_methods ?? [];

  return (
    <>
      {methods.includes("nostr_action") && (
        <VariantBlock {...props} variant="action" />
      )}
      {methods.includes("nostr_hashtag") && (
        <VariantBlock {...props} variant="hashtag" />
      )}
    </>
  );
}
