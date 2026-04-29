"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/routing";
import { FormInput, FormTextarea } from "@/components/ui/form";
import { FieldLabel } from "@/components/common/FieldLabel";
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
import { useToast } from "@/components/ui/toast";
import { translateApiError } from "@/lib/api/translate-error";
import type { VerificationMethod } from "@/lib/types";

// Lazy-loaded so the share modal's nostr publish chain doesn't ship
// on the create-form bundle. It only renders after the user finishes
// creating a challenge — the few-hundred-ms loader is invisible
// because the modal opens right after a successful POST anyway.
const ShareOnNostrModal = dynamic(
  () =>
    import("@/components/share/ShareOnNostrModal").then(
      (m) => m.ShareOnNostrModal
    ),
  { ssr: false }
);
import { slugify } from "@/lib/utils";
import { CheckpointEditor, type CheckpointDraft } from "./CheckpointEditor";
import { RewardSection, type RewardZapMode } from "./RewardSection";
import { VerificationSection } from "./VerificationSection";
import styles from "./create-challenge-form.module.scss";

export type { CheckpointDraft } from "./CheckpointEditor";

type ChallengeType = "one_time" | "streak" | "competition" | "race" | "creative";
type CheckpointMode = "none" | "sequential" | "parallel";

const CHALLENGE_TYPES: ChallengeType[] = [
  "one_time",
  "streak",
  "competition",
  "race",
  "creative",
];
const CHECKPOINT_MODES: CheckpointMode[] = ["none", "sequential", "parallel"];

interface RenderHeaderContext {
  loading: boolean;
}

interface CreateChallengeFormProps {
  renderHeader: (ctx: RenderHeaderContext) => ReactNode;
}

export function CreateChallengeForm({ renderHeader }: CreateChallengeFormProps) {
  const t = useTranslations("createChallenge");
  const tErr = useTranslations("errors.codes");
  const router = useRouter();
  const { showToast } = useToast();
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
    setVerification((prev) => {
      const has = prev.includes(method);
      if (has) return prev.filter((m) => m !== method);
      // `automatic` (honor system) auto-approves on submit, so combining
      // it with another method would silently bypass review. Picking
      // either side wipes the other so the selection always lands in a
      // schema-valid state.
      if (method === "automatic") return ["automatic"];
      return [...prev.filter((m) => m !== "automatic"), method];
    });
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

    // Client-side date sanity check. The schema accepts both fields
    // independently — there's no cross-field rule on the server because
    // the server can't know what UX the form intended. Catching this
    // here saves a round-trip and gives a clearer message than the
    // generic schema error would.
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      setError(t("endsBeforeStart"));
      return;
    }

    // Pre-compute how many signer prompts the user is going to see so
    // we can announce them up front. Always 1 for the challenge event,
    // +1 if a badge name is set (kind:30009 definition), +1 if a prize
    // pot is set with an active signer (kind:9041 zap goal).
    const willSignBadge = !!badgeName;
    const willSignZapGoal =
      !!prizeAmountSats && Number(prizeAmountSats) > 0 && !!signer?.pubkey;
    const totalSigns = 1 + (willSignBadge ? 1 : 0) + (willSignZapGoal ? 1 : 0);

    setLoading(true);
    try {
      if (totalSigns > 1) {
        setWarning(t("multiSignNotice", { step: 1, total: totalSigns }));
      }
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
        setError(translateApiError(json, tErr, t("createFailed")));
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
        if (totalSigns > 1) {
          setWarning(t("multiSignNotice", { step: 2, total: totalSigns }));
        }
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
        } catch (err) {
          // Cancelling the second prompt used to be a silent no-op,
          // which left the creator wondering why the "1 of N" notice
          // never advanced. We swallow signer cancellations cleanly
          // (the lazy-publish on first award still works) but surface
          // anything else so a real publish failure isn't invisible.
          if (!isSignerCancellation(err)) {
            setWarning(t("badgePublishFailed"));
          }
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
          if (totalSigns > 1) {
            setWarning(
              t("multiSignNotice", { step: totalSigns, total: totalSigns })
            );
          }
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
          } catch (err) {
            // Same rationale as the badge branch above — let the
            // explicit "publish failed" warning supersede the
            // mid-flight "step N/N" notice on cancel or relay error,
            // and treat signer cancellations as quiet so the create
            // flow can still complete with the challenge in place.
            if (!isSignerCancellation(err)) {
              setWarning(t("zapGoalPublishFailed"));
            }
          }
        }
      }

      showToast(t("success"), "success");
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
