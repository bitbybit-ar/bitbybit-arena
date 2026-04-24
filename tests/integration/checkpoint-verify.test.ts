/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import {
  challenge_checkpoints,
  checkpoint_completions,
  challenges,
  participants,
} from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedParticipant,
  buildRequest,
  parseResponse,
} from "./helpers";

vi.mock("@/lib/auth", async () => {
  const { sessionRef } = await import("./helpers");
  return {
    getSession: vi.fn(() => Promise.resolve(sessionRef.current)),
    AuthSession: {},
  };
});

vi.mock("@/lib/db", async () => {
  const { testDb } = await import("./setup");
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema"
  );
  return { getDb: vi.fn(() => testDb), ...schema };
});

const completeRoute = await import(
  "@/app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route"
);
const verifyRoute = await import(
  "@/app/api/checkpoint-completions/[id]/verify/route"
);

async function seedChallengeWithCreatorApprovalCheckpoints(
  creatorId: string,
  titles: string[]
) {
  const [challenge] = await testDb
    .insert(challenges)
    .values({
      creator_id: creatorId,
      slug: `cpv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: "Creator Approval Checkpoints",
      description: "Challenge whose checkpoints require creator approval",
      type: "one_time",
      verification_methods: ["creator_approval"],
      checkpoint_mode: "parallel",
      goal: titles.length,
      unit: "checkpoints",
      status: "open",
    })
    .returning();

  const inserted = await testDb
    .insert(challenge_checkpoints)
    .values(
      titles.map((title, idx) => ({
        challenge_id: challenge.id,
        order: idx,
        title,
        verification_methods: ["creator_approval" as const],
      }))
    )
    .returning();

  const ordered = [...inserted].sort((a, b) => a.order - b.order);
  return { challenge, checkpoints: ordered };
}

describe("Integration: Checkpoint creator-approval verify flow", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ display_name: "Creator" });
    participant = await seedUser({
      display_name: "Doer",
      nostr_pubkey: "doer_pubkey",
    });
  });

  it("approving a pending checkpoint bumps participant progress", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["A", "B"]);
    const participation = await seedParticipant(challenge.id, participant.id, {
      status: "active",
    });

    // Participant submits — lands as pending because checkpoint requires
    // creator approval.
    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Proof of checkpoint A" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe("pending");

    // Progress is still 0 — pending submissions don't count.
    let [p] = await testDb
      .select()
      .from(participants)
      .where(eq(participants.id, participation.id));
    expect(p.progress).toBe(0);

    // Creator approves.
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const verifyRes = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "approved" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    const verified = await parseResponse(verifyRes);
    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe("approved");
    expect(verified.body.data.completed_at).not.toBeNull();

    [p] = await testDb
      .select()
      .from(participants)
      .where(eq(participants.id, participation.id));
    expect(p.progress).toBe(1);
    expect(p.status).toBe("active"); // 1/2 — not yet complete
  });

  it("approving the last checkpoint flips participant to completed", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, [
        "Only",
      ]);
    const participation = await seedParticipant(challenge.id, participant.id, {
      status: "active",
    });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Solo proof" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);
    expect(submitted.status).toBe(201);

    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const verifyRes = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "approved" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    expect(verifyRes.status).toBe(200);

    const [p] = await testDb
      .select()
      .from(participants)
      .where(eq(participants.id, participation.id));
    expect(p.progress).toBe(1);
    expect(p.status).toBe("completed");
    expect(p.completed_at).not.toBeNull();
  });

  it("rejecting a pending checkpoint does not bump progress", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["A"]);
    const participation = await seedParticipant(challenge.id, participant.id, {
      status: "active",
    });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Proof" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);
    expect(submitted.status).toBe(201);

    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const verifyRes = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "rejected" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    const { status, body } = await parseResponse(verifyRes);
    expect(status).toBe(200);
    expect(body.data.status).toBe("rejected");
    expect(body.data.completed_at).toBeNull();

    const [p] = await testDb
      .select()
      .from(participants)
      .where(eq(participants.id, participation.id));
    expect(p.progress).toBe(0);
    expect(p.status).toBe("active");
  });

  it("rejects a non-creator trying to verify", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["A"]);
    await seedParticipant(challenge.id, participant.id, { status: "active" });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Proof" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);
    expect(submitted.status).toBe(201);

    // Random third-party tries to verify — 403.
    const outsider = await seedUser({ display_name: "Outsider" });
    setSession(makeSession(outsider.id));
    const res = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "approved" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    expect(res.status).toBe(403);

    // Status is still pending in the DB.
    const [row] = await testDb
      .select()
      .from(checkpoint_completions)
      .where(eq(checkpoint_completions.id, submitted.body.data.id));
    expect(row.status).toBe("pending");
  });

  it("participant can resubmit after rejection and be approved on the retry", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["Only"]);
    const participation = await seedParticipant(challenge.id, participant.id, {
      status: "active",
    });

    // First submission — pending, then rejected.
    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const first = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "First attempt — probably wrong" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const firstBody = await parseResponse(first);
    expect(firstBody.status).toBe(201);
    const submissionId = firstBody.body.data.id;

    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const reject = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submissionId}/verify`,
        { status: "rejected" }
      ),
      { params: Promise.resolve({ id: submissionId }) }
    );
    expect(reject.status).toBe(200);

    // Second attempt from the participant — same (participant, checkpoint)
    // pair but now rewrites the existing row instead of 400'ing on the
    // unique index.
    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const retry = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Second attempt — with the right proof" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const retryBody = await parseResponse(retry);
    expect(retryBody.status).toBe(201);
    expect(retryBody.body.data.id).toBe(submissionId); // same row, updated
    expect(retryBody.body.data.status).toBe("pending");
    expect(retryBody.body.data.content).toContain("Second attempt");

    // Creator approves the retry — progress advances.
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const approve = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submissionId}/verify`,
        { status: "approved" }
      ),
      { params: Promise.resolve({ id: submissionId }) }
    );
    expect(approve.status).toBe(200);

    const [p] = await testDb
      .select()
      .from(participants)
      .where(eq(participants.id, participation.id));
    expect(p.progress).toBe(1);
    expect(p.status).toBe("completed");

    // Exactly one checkpoint_completions row exists — retry updated in
    // place instead of inserting a second row.
    const rows = await testDb
      .select()
      .from(checkpoint_completions)
      .where(eq(checkpoint_completions.checkpoint_id, checkpoints[0].id));
    expect(rows).toHaveLength(1);
  });

  it("blocks a resubmit while the first attempt is still pending", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["Only"]);
    await seedParticipant(challenge.id, participant.id, { status: "active" });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const first = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "First attempt" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    expect(first.status).toBe(201);

    const second = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Second attempt without waiting" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    // Pending submission is not a retry target — 400.
    expect(second.status).toBe(400);
  });

  it("rejects re-verifying an already-reviewed submission", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["A", "B"]);
    await seedParticipant(challenge.id, participant.id, { status: "active" });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Proof" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);

    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const first = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "approved" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    expect(first.status).toBe(200);

    const second = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "rejected" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    expect(second.status).toBe(400);
  });

  it("persists reject_reason on rejection and clears it when the participant resubmits", async () => {
    const { challenge, checkpoints } =
      await seedChallengeWithCreatorApprovalCheckpoints(creator.id, ["Only"]);
    await seedParticipant(challenge.id, participant.id, { status: "active" });

    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const submitRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "First attempt" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    const submitted = await parseResponse(submitRes);
    expect(submitted.status).toBe(201);

    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const rejectRes = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "rejected", reject_reason: "  needs a photo of the result  " }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    const rejected = await parseResponse(rejectRes);
    expect(rejected.status).toBe(200);
    // Trimmed on the way in.
    expect(rejected.body.data.reject_reason).toBe(
      "needs a photo of the result"
    );

    // Participant retries — row upserts and the stale reason must go.
    setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));
    const retryRes = await completeRoute.POST(
      buildRequest(
        "POST",
        `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
        { content: "Second attempt with the photo" }
      ),
      {
        params: Promise.resolve({
          id: challenge.id,
          checkpointId: checkpoints[0].id,
        }),
      }
    );
    expect(retryRes.status).toBe(201);
    const [row] = await testDb
      .select()
      .from(checkpoint_completions)
      .where(eq(checkpoint_completions.id, submitted.body.data.id));
    expect(row.reject_reason).toBeNull();
    expect(row.status).toBe("pending");

    // Creator approves — reject_reason stays cleared.
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const approveRes = await verifyRoute.POST(
      buildRequest(
        "POST",
        `/api/checkpoint-completions/${submitted.body.data.id}/verify`,
        { status: "approved", reject_reason: "should be ignored" }
      ),
      { params: Promise.resolve({ id: submitted.body.data.id }) }
    );
    expect(approveRes.status).toBe(200);
    const [approved] = await testDb
      .select()
      .from(checkpoint_completions)
      .where(eq(checkpoint_completions.id, submitted.body.data.id));
    expect(approved.status).toBe("approved");
    expect(approved.reject_reason).toBeNull();
  });
});
