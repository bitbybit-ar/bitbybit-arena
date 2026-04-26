import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { findResourceOrOwn, findParticipation } from "@/lib/api/db-helpers";
import { createVerifySubmissionHandler } from "@/lib/api/verify-submission-handler";
import { VerifyCompletionBodySchema } from "@/lib/schemas/completions";
import { completions, challenges, participants } from "@/lib/db/schema";

type CompletionRow = InferSelectModel<typeof completions>;
type ChallengeRow = InferSelectModel<typeof challenges>;
type ParticipantRow = InferSelectModel<typeof participants>;

// POST /api/completions/[id]/verify — creator approves or rejects a completion
export const POST = createVerifySubmissionHandler<
  { status: "approved" | "rejected"; reject_reason?: string | null },
  CompletionRow,
  ChallengeRow,
  { participation: ParticipantRow | undefined }
>({
  table: completions,
  bodySchema: VerifyCompletionBodySchema,
  challengeCreatorField: "creator_id",
  submissionStatusField: "status",
  forbiddenMessage: "Only the challenge creator can verify completions",
  alreadyReviewedMessage: "This completion has already been reviewed",
  notificationContext: "completion_verified",
  async fetchContext({ db, session, params, body }) {
    const submission = await findResourceOrOwn(db, completions, params.id, {
      resourceName: "Completion",
    });

    // Authz before the status check so a non-creator probing a completion
    // id can't tell whether it exists or whether it's been reviewed.
    const challenge = await findResourceOrOwn(db, challenges, submission.challenge_id, {
      resourceName: "Challenge",
      ownerField: "creator_id",
      session,
      forbiddenMessage: "Only the challenge creator can verify completions",
    });

    // For an approval we also bump the participant's progress — a mid-flow
    // crash between those writes used to leave the completion marked
    // approved with stale progress, so batch them together. neon-http's
    // drizzle driver runs `db.batch([...])` as a single implicit
    // transaction; read the participant up-front so progress math can
    // be resolved before the batch is assembled.
    const participation =
      body.status === "approved"
        ? await findParticipation(db, challenge.id, submission.user_id)
        : undefined;

    return { submission, challenge, extra: { participation } };
  },
  updatePatch({ session }, body) {
    return {
      status: body.status,
      reviewed_by: session.user_id,
      reviewed_at: new Date(),
      // Only persist reject_reason on rejections; an approval should
      // wipe any stale reason left over from a previous review (the
      // resubmit path may re-flip a row from rejected back to pending,
      // and we don't want the old note to bleed onto a fresh review).
      reject_reason: body.status === "rejected" ? body.reject_reason ?? null : null,
    };
  },
  async extraWrites({ db, challenge, extra, status }) {
    if (status !== "approved" || !extra.participation) return [];
    const participation = extra.participation;
    const newProgress = participation.progress + 1;
    const isComplete = challenge.goal ? newProgress >= challenge.goal : true;
    return [
      db
        .update(participants)
        .set({
          progress: newProgress,
          ...(isComplete
            ? { status: "completed" as const, completed_at: new Date() }
            : {}),
        })
        .where(eq(participants.id, participation.id)),
    ];
  },
  notification({ submission, challenge, session, status, rejectReason }) {
    // Ping the submitter with the verdict. Client renders approved vs
    // rejected from metadata.status, so we only need one notification type.
    if (submission.user_id === session.user_id) return null;
    return {
      userId: submission.user_id,
      type: "completion_verified",
      title: status === "approved" ? "Proof approved!" : "Proof rejected",
      body: `Your proof on "${challenge.title}" was ${status}.`,
      metadata: {
        status,
        challenge: challenge.title,
        challenge_id: challenge.id,
        completion_id: submission.id,
        // Carry the reason through metadata so the bell + the
        // submitter's challenge-detail view can render it inline.
        ...(rejectReason ? { reject_reason: rejectReason } : {}),
      },
    };
  },
});
