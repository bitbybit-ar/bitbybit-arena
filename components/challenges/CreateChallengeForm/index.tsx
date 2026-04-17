"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { FormInput, FormTextarea } from "@/components/ui/form";
import { Tooltip } from "@/components/common/Tooltip";
import { FormDivider } from "@/components/common/FormDivider";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";
import { TagInput } from "@/components/common/TagInput";
import { ImageUpload } from "@/components/common/ImageUpload";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import { HttpUrlSchema } from "@/lib/schemas/primitives";
import {
  buildChallengeEvent,
  buildZapGoalEvent,
  buildBadgeDefinitionEvent,
} from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import type { NostrEvent } from "@/lib/nostr/types";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import { isSignerCancellation } from "@/lib/nostr/auth-errors";
import { useSignerContext } from "@/lib/signer-context";
import { ShareOnNostrModal } from "@/components/share/ShareOnNostrModal";
import type { VerificationMethod } from "@/lib/types";
import { slugify } from "@/lib/utils";
import styles from "./create-challenge-form.module.scss";

type ChallengeType = "one_time" | "streak" | "competition" | "race" | "creative";
type CheckpointMode = "none" | "sequential" | "parallel";
type RewardZapMode = "first_to_complete" | "split" | "tiered";

const VERIFICATION_METHODS: VerificationMethod[] = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
];
const CHALLENGE_TYPES: ChallengeType[] = [
  "one_time",
  "streak",
  "competition",
  "race",
  "creative",
];
const CHECKPOINT_MODES: CheckpointMode[] = ["none", "sequential", "parallel"];

// Small helper: label + optional tooltip rendered as sibling of the <label>,
// not a child. Avoids the "click tooltip → focus input" side effect caused by
// nesting interactive elements inside a <label htmlFor>.
function FieldLabel({
  htmlFor,
  children,
  tooltip,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  tooltip?: { text: string; example?: string };
  required?: boolean;
}) {
  const inner = (
    <>
      {children}
      {required && <span className={styles.required}>*</span>}
    </>
  );
  return (
    <div className={styles.labelRow}>
      {htmlFor ? <label htmlFor={htmlFor}>{inner}</label> : <span>{inner}</span>}
      {tooltip && <Tooltip text={tooltip.text} example={tooltip.example} />}
    </div>
  );
}

interface CheckpointDraft {
  title: string;
  description: string;
  verification_methods: VerificationMethod[];
  nostr_action_target_event_id: string;
  nostr_hashtag: string;
}

interface RenderHeaderContext {
  loading: boolean;
}

interface CreateChallengeFormProps {
  renderHeader: (ctx: RenderHeaderContext) => ReactNode;
}

export function CreateChallengeForm({ renderHeader }: CreateChallengeFormProps) {
  const t = useTranslations("createChallenge");
  const router = useRouter();
  const { needsSigner, signWithPrompt, requestReSignIn, signer } = useSignerContext();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [type, setType] = useState<ChallengeType>("one_time");
  const [tags, setTags] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [unit, setUnit] = useState("");

  const [verification, setVerification] = useState<VerificationMethod[]>([
    "creator_approval",
  ]);
  const [nostrActionTarget, setNostrActionTarget] = useState("");
  const [nostrHashtag, setNostrHashtag] = useState("");

  const [checkpointMode, setCheckpointMode] = useState<CheckpointMode>("none");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);

  const [prizeAmountSats, setPrizeAmountSats] = useState("");
  const [rewardZapMode, setRewardZapMode] =
    useState<RewardZapMode>("first_to_complete");
  const [publishZapGoal, setPublishZapGoal] = useState(false);

  const [badgeName, setBadgeName] = useState("");
  const [badgeImage, setBadgeImage] = useState<BlossomDescriptor | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [shareContext, setShareContext] = useState<
    { id: string; title: string } | null
  >(null);

  const showGoal = type === "streak" || type === "competition";

  const toggleVerification = (method: VerificationMethod) => {
    setVerification((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  };

  const toggleCheckpointVerification = (
    idx: number,
    method: VerificationMethod
  ) => {
    setCheckpoints((prev) =>
      prev.map((cp, i) => {
        if (i !== idx) return cp;
        const has = cp.verification_methods.includes(method);
        return {
          ...cp,
          verification_methods: has
            ? cp.verification_methods.filter((m) => m !== method)
            : [...cp.verification_methods, method],
        };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);

    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }

    if (verification.length === 0) {
      setError(t("verificationEmptyError"));
      return;
    }
    if (
      verification.includes("nostr_action") &&
      !/^[0-9a-f]{64}$/i.test(nostrActionTarget.trim())
    ) {
      setError(t("nostrActionTargetError"));
      return;
    }
    if (
      verification.includes("nostr_hashtag") &&
      !/^#?[a-z0-9_]{2,50}$/i.test(nostrHashtag.trim())
    ) {
      setError(t("nostrHashtagError"));
      return;
    }

    // Blossom-hosted URLs are always https://, but guard the field anyway
    // so dev-tools edits or future paste-URL affordances can't slip a
    // non-http(s) value past the client into the API. Same schema the
    // API uses (lib/schemas/primitives.ts) so client + server stay in
    // lockstep.
    const badgeUrlResult = HttpUrlSchema.safeParse(badgeImage?.url);
    if (!badgeUrlResult.success) {
      const issue = badgeUrlResult.error.issues[0];
      setError(`badge_image_url: ${issue?.message ?? t("createFailed")}`);
      return;
    }

    if (checkpointMode !== "none") {
      if (checkpoints.length === 0) {
        setError(t("checkpointsEmptyError"));
        return;
      }
      for (let i = 0; i < checkpoints.length; i += 1) {
        const cp = checkpoints[i];
        if (cp.title.trim().length < 3) {
          setError(t("checkpointTitleError", { index: i + 1 }));
          return;
        }
        if (cp.verification_methods.length === 0) {
          setError(t("verificationEmptyError"));
          return;
        }
        if (
          cp.verification_methods.includes("nostr_action") &&
          !/^[0-9a-f]{64}$/i.test(cp.nostr_action_target_event_id.trim())
        ) {
          setError(t("checkpointTargetError", { index: i + 1 }));
          return;
        }
        if (
          cp.verification_methods.includes("nostr_hashtag") &&
          !/^#?[a-z0-9_]{2,50}$/i.test(cp.nostr_hashtag.trim())
        ) {
          setError(t("checkpointHashtagError", { index: i + 1 }));
          return;
        }
      }
    }

    setLoading(true);
    try {
      // Sign the kind:30100 challenge event BEFORE touching the database.
      // If the user cancels the extension prompt we must not leave an
      // orphan row behind. The slug is generated client-side so the
      // signed event and the persisted row stay in lockstep — the server
      // accepts the same slug + event id verbatim in the POST body.
      const slug = slugify(title);
      const challengeEvent = buildChallengeEvent({
        slug,
        title,
        description,
        type,
        tags,
        goal: goal ? Number(goal) : undefined,
        unit: unit || undefined,
        verification,
        badgeName: badgeName || undefined,
        badgeImageUrl: badgeImage?.url || undefined,
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
      });

      let signedChallenge: NostrEvent;
      try {
        signedChallenge = await signWithPrompt(challengeEvent);
      } catch (err) {
        // Distinguish a deliberate cancel (silent) from an unexpected
        // signer failure (surface a message). Either way we abort before
        // touching the DB so no orphan row is created.
        if (!isSignerCancellation(err)) {
          setError(t("signingFailed"));
        }
        return;
      }

      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          nostr_event_id: signedChallenge.id,
          title,
          description,
          type,
          tags,
          goal: goal ? Number(goal) : undefined,
          unit: unit || undefined,
          verification_methods: verification,
          nostr_action_target_event_id: verification.includes("nostr_action")
            ? nostrActionTarget.trim().toLowerCase()
            : undefined,
          nostr_hashtag: verification.includes("nostr_hashtag")
            ? nostrHashtag.trim().toLowerCase().replace(/^#/, "")
            : undefined,
          prize_amount_sats: prizeAmountSats ? Number(prizeAmountSats) : undefined,
          prize_distribution:
            prizeAmountSats && Number(prizeAmountSats) > 0
              ? rewardZapMode
              : undefined,
          checkpoint_mode: checkpointMode,
          checkpoints:
            checkpointMode !== "none"
              ? checkpoints.map((cp) => ({
                  title: cp.title.trim(),
                  description: cp.description.trim() || null,
                  verification_methods: cp.verification_methods,
                  nostr_action_target_event_id:
                    cp.verification_methods.includes("nostr_action")
                      ? cp.nostr_action_target_event_id.trim().toLowerCase()
                      : null,
                  nostr_hashtag: cp.verification_methods.includes("nostr_hashtag")
                    ? cp.nostr_hashtag.trim().toLowerCase().replace(/^#/, "")
                    : null,
                }))
              : undefined,
          badge_name: badgeName || undefined,
          badge_image_url: badgeImage?.url || undefined,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error);
        return;
      }

      // Publishing to relays is best-effort — the canonical record now lives
      // in our DB regardless of relay reachability.
      publishSignedEvent(signedChallenge).catch(() => {
        /* non-blocking */
      });

      // NIP-58: publish a Badge Definition (kind 30009) so the awards we
      // emit later can `a`-tag it per spec. The challenge slug doubles as
      // the badge `d` tag (unique per creator, already validated server-
      // side). Non-blocking — if this fails the challenge itself still
      // exists and we'll lazy-publish on first award.
      if (badgeName) {
        try {
          const badgeDefinition = buildBadgeDefinitionEvent({
            slug: json.data.slug,
            name: badgeName,
            description: description || undefined,
            // Pass the full descriptor so the kind:30009 event carries
            // sha256/size/mime in a sibling NIP-92 imeta tag. Recipients
            // can use the sha256 to fetch the badge image from any
            // Blossom mirror that holds the blob.
            image: badgeImage ?? undefined,
          });
          const signedDef = await signWithPrompt(badgeDefinition);
          await publishSignedEvent(signedDef);
          await fetch(`/api/challenges/${json.data.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ badge_nostr_event_id: signedDef.id }),
          });
        } catch {
          /* non-blocking — lazy-publish on first award */
        }
      }

      if (publishZapGoal && prizeAmountSats && Number(prizeAmountSats) > 0) {
        if (!signer?.pubkey) {
          setWarning(t("zapGoalSkippedNoSigner"));
        } else {
          try {
            const goalEvent = buildZapGoalEvent({
              challengeSlug: json.data.slug,
              creatorPubkey: signer.pubkey,
              amountSats: Number(prizeAmountSats),
              title: `Prize pot: ${title}`,
              relays: DEFAULT_RELAYS,
              closedAt: endsAt || undefined,
            });
            const signedGoal = await signWithPrompt(goalEvent);
            await publishSignedEvent(signedGoal);
            await fetch(`/api/challenges/${json.data.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ zap_goal_event_id: signedGoal.id }),
            });
          } catch {
            setWarning(t("zapGoalPublishFailed"));
          }
        }
      }

      setShareContext({ id: json.data.id, title });
    } catch {
      setError(t("createFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleShareClose = () => {
    const target = shareContext;
    setShareContext(null);
    if (target) router.push(`/explore/${target.id}`);
  };

  const addCheckpoint = () => {
    setCheckpoints((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        verification_methods: ["creator_approval"],
        nostr_action_target_event_id: "",
        nostr_hashtag: "",
      },
    ]);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {renderHeader({ loading })}

      {/* ─────────────── Section 1: General ─────────────── */}
      <FormDivider label={t("sections.general")} />

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-title"
          required
          tooltip={{
            text: t("tooltips.name.text"),
            example: t("tooltips.name.example"),
          }}
        >
          {t("nameLabel")}
        </FieldLabel>
        <FormInput
          id="cc-title"
          placeholder={t("namePlaceholder")}
          value={title}
          onChange={setTitle}
          required
        />
      </div>

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-description"
          required
          tooltip={{
            text: t("tooltips.description.text"),
            example: t("tooltips.description.example"),
          }}
        >
          {t("descriptionLabel")}
        </FieldLabel>
        <FormTextarea
          id="cc-description"
          placeholder={t("descriptionPlaceholder")}
          value={description}
          onChange={setDescription}
          rows={4}
          required
        />
      </div>

      <div className={styles.row}>
        <div className={styles.fieldGroup}>
          <FieldLabel
            htmlFor="cc-starts"
            tooltip={{
              text: t("tooltips.dates.text"),
              example: t("tooltips.dates.example"),
            }}
          >
            {t("startsAtLabel")}
          </FieldLabel>
          <FormInput
            id="cc-starts"
            type="date"
            value={startsAt}
            onChange={setStartsAt}
          />
        </div>
        <div className={styles.fieldGroup}>
          <FieldLabel htmlFor="cc-ends">{t("endsAtLabel")}</FieldLabel>
          <FormInput
            id="cc-ends"
            type="date"
            value={endsAt}
            onChange={setEndsAt}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <FieldLabel
          tooltip={{
            text: t("tooltips.type.text"),
            example: t("tooltips.type.example"),
          }}
        >
          {t("typeLabel")}
        </FieldLabel>
        <OptionCardGroup label={t("typeLabel")}>
          {CHALLENGE_TYPES.map((ct) => (
            <OptionCard
              key={ct}
              title={t(`types.${ct}`)}
              description={t(`typeDescriptions.${ct}`)}
              selected={type === ct}
              onToggle={() => setType(ct)}
            />
          ))}
        </OptionCardGroup>
      </div>

      {showGoal && (
        <div className={styles.row}>
          <div className={styles.fieldGroup}>
            <FieldLabel htmlFor="cc-goal">{t("goalLabel")}</FieldLabel>
            <FormInput
              id="cc-goal"
              type="number"
              placeholder={t("goalPlaceholder")}
              value={goal}
              onChange={setGoal}
            />
          </div>
          <div className={styles.fieldGroup}>
            <FieldLabel htmlFor="cc-unit">{t("unitLabel")}</FieldLabel>
            <FormInput
              id="cc-unit"
              placeholder={t("unitPlaceholder")}
              value={unit}
              onChange={setUnit}
            />
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-tags"
          tooltip={{
            text: t("tooltips.tags.text"),
            example: t("tooltips.tags.example"),
          }}
        >
          {t("tagsLabel")}
        </FieldLabel>
        <TagInput
          id="cc-tags"
          value={tags}
          onChange={setTags}
          placeholder={t("tagsPlaceholder")}
        />
        <span className={styles.hint}>{t("tagsHint")}</span>
      </div>

      {/* ─────────────── Section 2: Details ─────────────── */}
      <FormDivider label={t("sections.details")} />

      <div className={styles.fieldGroup}>
        <FieldLabel
          required
          tooltip={{
            text: t("tooltips.verification.text"),
            example: t("tooltips.verification.example"),
          }}
        >
          {t("verificationLabel")}
        </FieldLabel>
        <OptionCardGroup label={t("verificationLabel")}>
          {VERIFICATION_METHODS.map((method) => (
            <OptionCard
              key={method}
              multi
              title={t(`verificationTypes.${method}`)}
              description={t(`verificationDescriptions.${method}`)}
              selected={verification.includes(method)}
              onToggle={() => toggleVerification(method)}
            />
          ))}
        </OptionCardGroup>
      </div>

      {verification.includes("nostr_action") && (
        <div className={styles.fieldGroup}>
          <FieldLabel htmlFor="cc-action-target">
            {t("nostrActionTargetLabel")}
          </FieldLabel>
          <FormInput
            id="cc-action-target"
            placeholder={t("nostrActionTargetPlaceholder")}
            value={nostrActionTarget}
            onChange={setNostrActionTarget}
          />
        </div>
      )}

      {verification.includes("nostr_hashtag") && (
        <div className={styles.fieldGroup}>
          <FieldLabel htmlFor="cc-hashtag">{t("nostrHashtagLabel")}</FieldLabel>
          <FormInput
            id="cc-hashtag"
            placeholder={t("nostrHashtagPlaceholder")}
            value={nostrHashtag}
            onChange={setNostrHashtag}
          />
        </div>
      )}

      <div className={styles.fieldGroup}>
        <FieldLabel
          tooltip={{
            text: t("tooltips.checkpoints.text"),
            example: t("tooltips.checkpoints.example"),
          }}
        >
          {t("checkpointModeLabel")}
        </FieldLabel>
        <OptionCardGroup label={t("checkpointModeLabel")}>
          {CHECKPOINT_MODES.map((mode) => (
            <OptionCard
              key={mode}
              title={t(`checkpointModes.${mode}`)}
              description={t(`checkpointModeDescriptions.${mode}`)}
              selected={checkpointMode === mode}
              onToggle={() => setCheckpointMode(mode)}
            />
          ))}
        </OptionCardGroup>
      </div>

      {checkpointMode !== "none" && (
        <div className={styles.checkpointsSection}>
          <span className={styles.hint}>{t("checkpointsHint")}</span>
          {checkpoints.map((cp, idx) => (
            <div key={idx} className={styles.checkpointRow}>
              <div className={styles.checkpointHeader}>
                <span className={styles.checkpointIndex}>
                  {t("checkpointIndex", { index: idx + 1 })}
                </span>
                <button
                  type="button"
                  className={styles.checkpointRemove}
                  onClick={() =>
                    setCheckpoints((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  {t("removeCheckpoint")}
                </button>
              </div>
              <FormInput
                label={t("checkpointTitleLabel")}
                value={cp.title}
                onChange={(v) =>
                  setCheckpoints((prev) =>
                    prev.map((c, i) => (i === idx ? { ...c, title: v } : c))
                  )
                }
                required
              />
              <FormTextarea
                label={t("checkpointDescriptionLabel")}
                value={cp.description}
                onChange={(v) =>
                  setCheckpoints((prev) =>
                    prev.map((c, i) =>
                      i === idx ? { ...c, description: v } : c
                    )
                  )
                }
                rows={2}
              />
              <OptionCardGroup label={t("verificationLabel")}>
                {VERIFICATION_METHODS.map((method) => (
                  <OptionCard
                    key={method}
                    multi
                    title={t(`verificationTypes.${method}`)}
                    selected={cp.verification_methods.includes(method)}
                    onToggle={() => toggleCheckpointVerification(idx, method)}
                  />
                ))}
              </OptionCardGroup>
              {cp.verification_methods.includes("nostr_action") && (
                <FormInput
                  label={t("nostrActionTargetLabel")}
                  placeholder={t("nostrActionTargetPlaceholder")}
                  value={cp.nostr_action_target_event_id}
                  onChange={(v) =>
                    setCheckpoints((prev) =>
                      prev.map((c, i) =>
                        i === idx
                          ? { ...c, nostr_action_target_event_id: v }
                          : c
                      )
                    )
                  }
                />
              )}
              {cp.verification_methods.includes("nostr_hashtag") && (
                <FormInput
                  label={t("nostrHashtagLabel")}
                  placeholder={t("nostrHashtagPlaceholder")}
                  value={cp.nostr_hashtag}
                  onChange={(v) =>
                    setCheckpoints((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, nostr_hashtag: v } : c
                      )
                    )
                  }
                />
              )}
            </div>
          ))}
          <button type="button" className={styles.addCheckpoint} onClick={addCheckpoint}>
            + {t("addCheckpoint")}
          </button>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-prize"
          tooltip={{
            text: t("tooltips.prize.text"),
            example: t("tooltips.prize.example"),
          }}
        >
          {t("prizeAmountLabel")}
        </FieldLabel>
        <FormInput
          id="cc-prize"
          type="number"
          placeholder={t("prizeAmountPlaceholder")}
          value={prizeAmountSats}
          onChange={setPrizeAmountSats}
        />
      </div>

      {prizeAmountSats && Number(prizeAmountSats) > 0 && (
        <>
          <div className={styles.fieldGroup}>
            <FieldLabel
              tooltip={{
                text: t("tooltips.rewardZapMode.text"),
                example: t("tooltips.rewardZapMode.example"),
              }}
            >
              {t("rewardZapModeLabel")}
            </FieldLabel>
            <OptionCardGroup label={t("rewardZapModeLabel")}>
              {(["first_to_complete", "split", "tiered"] as RewardZapMode[]).map(
                (mode) => (
                  <OptionCard
                    key={mode}
                    title={t(`rewardZapModes.${mode}`)}
                    description={t(`rewardZapModeDescriptions.${mode}`)}
                    selected={rewardZapMode === mode}
                    onToggle={() => setRewardZapMode(mode)}
                  />
                )
              )}
            </OptionCardGroup>
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={publishZapGoal}
              onChange={(e) => setPublishZapGoal(e.target.checked)}
            />
            <span>{t("publishZapGoalLabel")}</span>
          </label>
        </>
      )}

      {/* ─────────────── Section 3: Badge ─────────────── */}
      <FormDivider label={t("sections.badge")} />

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-badge-name"
          tooltip={{
            text: t("tooltips.badgeName.text"),
            example: t("tooltips.badgeName.example"),
          }}
        >
          {t("badgeNameLabel")}
        </FieldLabel>
        <FormInput
          id="cc-badge-name"
          placeholder={t("badgeNamePlaceholder")}
          value={badgeName}
          onChange={setBadgeName}
        />
      </div>

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-badge-image"
          tooltip={{
            text: t("tooltips.badgeImage.text"),
            example: t("tooltips.badgeImage.example"),
          }}
        >
          {t("badgeImageLabel")}
        </FieldLabel>
        <ImageUpload
          id="cc-badge-image"
          value={badgeImage}
          onChange={setBadgeImage}
          alt={badgeName || t("badgeImageLabel")}
          maxSizeMB={2}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {warning && <p className={styles.warning}>{warning}</p>}

      {shareContext && (
        <ShareOnNostrModal
          context={{
            kind: "challenge-created",
            challenge: shareContext,
          }}
          onClose={handleShareClose}
        />
      )}
    </form>
  );
}
