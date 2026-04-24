"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { FormInput, FormTextarea } from "@/components/ui/form";
import { Tooltip } from "@/components/common/Tooltip";
import { FormDivider } from "@/components/common/FormDivider";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";
import { TagInput } from "@/components/common/TagInput";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import { CreateChallengeBodySchema } from "@/lib/schemas/challenges";
import { validateForm } from "@/lib/schemas/validate-form";
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
import { CheckpointEditor, type CheckpointDraft } from "./CheckpointEditor";
import { RewardSection } from "./RewardSection";
import { VerificationSection } from "./VerificationSection";
import styles from "./create-challenge-form.module.scss";

export type { CheckpointDraft } from "./CheckpointEditor";

type ChallengeType = "one_time" | "streak" | "competition" | "race" | "creative";
type CheckpointMode = "none" | "sequential" | "parallel";
type RewardZapMode = "first_to_complete" | "split" | "tiered";

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

    // Build the body once, validate it against the same schema the
    // API uses (lib/schemas/challenges.ts), and reuse the parsed
    // values for both the signing payload and the POST body. A single
    // safeParse replaces the per-field regex / length checks the form
    // used to do — and surfaces the exact same error message the
    // server would have returned for the same input.
    const slug = slugify(title);
    const requestBody = {
      slug,
      title,
      description,
      type,
      tags,
      goal: goal ? Number(goal) : undefined,
      unit: unit || undefined,
      verification_methods: verification,
      nostr_action_target_event_id: verification.includes("nostr_action")
        ? nostrActionTarget
        : undefined,
      nostr_hashtag: verification.includes("nostr_hashtag")
        ? nostrHashtag
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
              title: cp.title,
              description: cp.description,
              verification_methods: cp.verification_methods,
              nostr_action_target_event_id:
                cp.verification_methods.includes("nostr_action")
                  ? cp.nostr_action_target_event_id
                  : undefined,
              nostr_hashtag: cp.verification_methods.includes("nostr_hashtag")
                ? cp.nostr_hashtag
                : undefined,
            }))
          : undefined,
      badge_name: badgeName || undefined,
      badge_image_url: badgeImage?.url || undefined,
      starts_at: startsAt || undefined,
      ends_at: endsAt || undefined,
    };
    const validation = validateForm(CreateChallengeBodySchema, requestBody);
    if (!validation.success) {
      setError(validation.firstError);
      return;
    }

    setLoading(true);
    try {
      // Sign the kind:30100 challenge event BEFORE touching the database.
      // If the user cancels the extension prompt we must not leave an
      // orphan row behind. The slug is generated client-side so the
      // signed event and the persisted row stay in lockstep — the server
      // accepts the same slug + event id verbatim in the POST body.
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
          ...requestBody,
          nostr_event_id: signedChallenge.id,
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

      // Auto-publish the NIP-75 zap goal whenever a prize is set.
      // Supporters need this event on-relay to zap the pot — without
      // it the prize exists in DB but is invisible to Nostr clients.
      // Publish is best-effort; if it fails the creator sees a
      // "Republish zap goal" button on the detail page.
      if (prizeAmountSats && Number(prizeAmountSats) > 0) {
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

      <VerificationSection
        verification={verification}
        onToggleVerification={toggleVerification}
        nostrActionTarget={nostrActionTarget}
        onNostrActionTargetChange={setNostrActionTarget}
        nostrHashtag={nostrHashtag}
        onNostrHashtagChange={setNostrHashtag}
        showGoal={showGoal}
        goal={goal}
        onGoalChange={setGoal}
        unit={unit}
        onUnitChange={setUnit}
        badgeName={badgeName}
        onBadgeNameChange={setBadgeName}
        badgeImage={badgeImage}
        onBadgeImageChange={setBadgeImage}
      />

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
        <CheckpointEditor
          checkpoints={checkpoints}
          onChange={setCheckpoints}
        />
      )}

      <RewardSection
        prizeAmountSats={prizeAmountSats}
        onPrizeAmountChange={setPrizeAmountSats}
        prizeDistribution={rewardZapMode}
        onPrizeDistributionChange={setRewardZapMode}
      />

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
