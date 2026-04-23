/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, asc } from "drizzle-orm";
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

const createChallengeRoute = await import("@/app/api/challenges/route");
const completeCheckpointRoute = await import(
  "@/app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route"
);

async function seedChallengeWithCheckpoints(
  creatorId: string,
  mode: "sequential" | "parallel",
  titles: string[]
) {
  const [challenge] = await testDb
    .insert(challenges)
    .values({
      creator_id: creatorId,
      slug: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: "Checkpoint Challenge",
      description: "Challenge with multiple checkpoints",
      type: "one_time",
      verification_methods: ["automatic"],
      checkpoint_mode: mode,
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
        verification_methods: ["automatic" as const],
      }))
    )
    .returning();

  const ordered = [...inserted].sort((a, b) => a.order - b.order);
  return { challenge, checkpoints: ordered };
}

describe("Integration: Checkpoints", () => {
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

  describe("POST /api/challenges — create with checkpoints", () => {
    it("persists checkpoint_mode and the checkpoint rows in order", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Multi step challenge",
          description: "A sequential challenge with three checkpoints",
          type: "one_time",
          checkpoint_mode: "sequential",
          checkpoints: [
            { title: "Step one", verification_methods: ["automatic"] },
            { title: "Step two", verification_methods: ["automatic"] },
            { title: "Step three", verification_methods: ["automatic"] },
          ],
        })
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(201);
      expect(body.data.checkpoint_mode).toBe("sequential");
      expect(body.data.goal).toBe(3);
      expect(body.data.unit).toBe("checkpoints");

      const rows = await testDb
        .select()
        .from(challenge_checkpoints)
        .where(eq(challenge_checkpoints.challenge_id, body.data.id))
        .orderBy(asc(challenge_checkpoints.order));
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.title)).toEqual([
        "Step one",
        "Step two",
        "Step three",
      ]);
      expect(rows.map((r) => r.order)).toEqual([0, 1, 2]);
    });

    it("rejects checkpoint_mode != none with empty checkpoints array", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Broken challenge",
          description: "Missing checkpoints but mode is set",
          checkpoint_mode: "parallel",
          checkpoints: [],
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects a checkpoint with a short title", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Bad checkpoint challenge",
          description: "Short checkpoint title fails",
          checkpoint_mode: "parallel",
          checkpoints: [{ title: "ok" }],
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /checkpoints/[checkpointId]/complete", () => {
    it("parallel mode: completes checkpoints in any order and flips participant to completed", async () => {
      const { challenge, checkpoints } = await seedChallengeWithCheckpoints(
        creator.id,
        "parallel",
        ["A", "B", "C"]
      );
      const participation = await seedParticipant(challenge.id, participant.id, {
        status: "active",
      });
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      // Complete checkpoint 2 first (out of order — allowed in parallel)
      let res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[1].id}/complete`,
          { content: "Proof for checkpoint B" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[1].id }) }
      );
      expect(res.status).toBe(201);

      res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
          { content: "Proof for checkpoint A" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[0].id }) }
      );
      expect(res.status).toBe(201);

      // Check participant progress after 2/3
      let [p] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.id, participation.id));
      expect(p.progress).toBe(2);
      expect(p.status).toBe("active");

      res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[2].id}/complete`,
          { content: "Proof for checkpoint C" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[2].id }) }
      );
      expect(res.status).toBe(201);

      [p] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.id, participation.id));
      expect(p.progress).toBe(3);
      expect(p.status).toBe("completed");
      expect(p.completed_at).not.toBeNull();
    });

    it("sequential mode: rejects a later checkpoint before the prior one is approved", async () => {
      const { challenge, checkpoints } = await seedChallengeWithCheckpoints(
        creator.id,
        "sequential",
        ["First", "Second"]
      );
      await seedParticipant(challenge.id, participant.id, { status: "active" });
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      // Skip straight to the second checkpoint → 400
      let res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[1].id}/complete`,
          { content: "Trying to jump ahead" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[1].id }) }
      );
      expect(res.status).toBe(400);

      // Finish the first, then the second — both succeed.
      res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
          { content: "First checkpoint proof" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[0].id }) }
      );
      expect(res.status).toBe(201);

      res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[1].id}/complete`,
          { content: "Second checkpoint proof" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[1].id }) }
      );
      expect(res.status).toBe(201);
    });

    it("rejects a second completion for the same checkpoint via unique index", async () => {
      // Use 2 checkpoints so the participant stays 'active' after one
      // completion — otherwise completing the only checkpoint flips their
      // status to 'completed' and the second POST would hit the active
      // guard first and return 403 instead of the 400 we're testing for.
      const { challenge, checkpoints } = await seedChallengeWithCheckpoints(
        creator.id,
        "parallel",
        ["One", "Two"]
      );
      await seedParticipant(challenge.id, participant.id, { status: "active" });
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      let res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
          { content: "First submission" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[0].id }) }
      );
      expect(res.status).toBe(201);

      res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
          { content: "Second submission" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[0].id }) }
      );
      expect(res.status).toBe(400);

      const rows = await testDb
        .select()
        .from(checkpoint_completions)
        .where(eq(checkpoint_completions.checkpoint_id, checkpoints[0].id));
      expect(rows).toHaveLength(1);
    });

    it("accepts an image-only submission when no text is provided", async () => {
      // Spin up a creator_approval checkpoint so we can inspect the
      // persisted row before it auto-advances to completed.
      const [challenge] = await testDb
        .insert(challenges)
        .values({
          creator_id: creator.id,
          slug: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: "Image-only checkpoint",
          description: "Challenge used to verify image-only submissions",
          type: "one_time",
          verification_methods: ["creator_approval"],
          checkpoint_mode: "parallel",
          goal: 1,
          unit: "checkpoints",
          status: "open",
        })
        .returning();
      const [cp] = await testDb
        .insert(challenge_checkpoints)
        .values({
          challenge_id: challenge.id,
          order: 0,
          title: "Attach a photo",
          verification_methods: ["creator_approval"],
        })
        .returning();
      await seedParticipant(challenge.id, participant.id, { status: "active" });
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      const res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${cp.id}/complete`,
          { image_url: "https://blossom.example/abc123.png" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: cp.id }) }
      );
      expect(res.status).toBe(201);

      const [row] = await testDb
        .select()
        .from(checkpoint_completions)
        .where(eq(checkpoint_completions.checkpoint_id, cp.id));
      expect(row.image_url).toBe("https://blossom.example/abc123.png");
      expect(row.content).toBeNull();
      expect(row.status).toBe("pending");
    });

    it("rejects a submission with neither text nor image", async () => {
      const [challenge] = await testDb
        .insert(challenges)
        .values({
          creator_id: creator.id,
          slug: `empty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: "Empty proof checkpoint",
          description: "Needs either text or image",
          type: "one_time",
          verification_methods: ["creator_approval"],
          checkpoint_mode: "parallel",
          goal: 1,
          unit: "checkpoints",
          status: "open",
        })
        .returning();
      const [cp] = await testDb
        .insert(challenge_checkpoints)
        .values({
          challenge_id: challenge.id,
          order: 0,
          title: "Anything",
          verification_methods: ["creator_approval"],
        })
        .returning();
      await seedParticipant(challenge.id, participant.id, { status: "active" });
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      const res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${cp.id}/complete`,
          {}
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: cp.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-participants", async () => {
      const { challenge, checkpoints } = await seedChallengeWithCheckpoints(
        creator.id,
        "parallel",
        ["Solo"]
      );
      // Note: no seedParticipant for participant
      setSession(makeSession(participant.id, { nostr_pubkey: "doer_pubkey" }));

      const res = await completeCheckpointRoute.POST(
        buildRequest(
          "POST",
          `/api/challenges/${challenge.id}/checkpoints/${checkpoints[0].id}/complete`,
          { content: "I never joined" }
        ),
        { params: Promise.resolve({ id: challenge.id, checkpointId: checkpoints[0].id }) }
      );
      expect(res.status).toBe(403);
    });
  });
});
