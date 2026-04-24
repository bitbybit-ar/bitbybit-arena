import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { BadRequestError } from "@/lib/api/errors";
import { findResourceOrOwn, findParticipation } from "@/lib/api/db-helpers";
import { VerifyCompletionBodySchema } from "@/lib/schemas/completions";
import { completions, challenges, participants } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

// POST /api/completions/[id]/verify — creator approves or rejects a completion
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const { status } = await parseBody(req, VerifyCompletionBodySchema);

  const completion = await findResourceOrOwn(db, completions, params.id, {
    resourceName: "Completion",
  });

  // Authz before the status check so a non-creator probing a completion
  // id can't tell whether it exists or whether it's been reviewed.
  const challenge = await findResourceOrOwn(db, challenges, completion.challenge_id, {
    resourceName: "Challenge",
    ownerField: "creator_id",
    session: session!,
    forbiddenMessage: "Only the challenge creator can verify completions",
  });
  if (completion.status !== "pending") throw new BadRequestError("This completion has already been reviewed");

  // For an approval we also bump the participant's progress — a mid-flow
  // crash between those writes used to leave the completion marked
  // approved with stale progress, so batch them together. neon-http's
  // drizzle driver runs `db.batch([...])` as a single implicit
  // transaction; read the participant up-front so progress math can
  // be resolved before the batch is assembled.
  const participation =
    status === "approved"
      ? await findParticipation(db, challenge.id, completion.user_id)
      : undefined;

  const updateCompletionStmt = db
    .update(completions)
    .set({
      status,
      reviewed_by: session!.user_id,
      reviewed_at: new Date(),
    })
    .where(eq(completions.id, params.id))
    .returning();

  let updated: typeof completion;
  if (status === "approved" && participation) {
    const newProgress = participation.progress + 1;
    const isComplete = challenge.goal ? newProgress >= challenge.goal : true;

    const [completionRows] = await db.batch([
      updateCompletionStmt,
      db
        .update(participants)
        .set({
          progress: newProgress,
          ...(isComplete
            ? { status: "completed" as const, completed_at: new Date() }
            : {}),
        })
        .where(eq(participants.id, participation.id)),
    ]);
    updated = completionRows[0];
  } else {
    const [row] = await updateCompletionStmt;
    updated = row;
  }

  // Ping the submitter with the verdict. Client renders approved vs
  // rejected from metadata.status, so we only need one notification type.
  if (completion.user_id !== session!.user_id) {
    await notifyUser(
      completion.user_id,
      "completion_verified",
      status === "approved" ? "Proof approved!" : "Proof rejected",
      `Your proof on "${challenge.title}" was ${status}.`,
      {
        status,
        challenge: challenge.title,
        challenge_id: challenge.id,
        completion_id: completion.id,
      }
    );
  }

  return updated;
});
