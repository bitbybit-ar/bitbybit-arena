/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb, testDb } from "./setup";
import {
  challenge_checkpoints,
  checkpoint_completions,
  challenges,
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

const pendingRoute = await import(
  "@/app/api/challenges/[id]/pending-checkpoint-submissions/route"
);

async function seedPendingChallenge(creatorId: string, count: number) {
  const [challenge] = await testDb
    .insert(challenges)
    .values({
      creator_id: creatorId,
      slug: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: "Pending queue test",
      description: "Challenge with a queue of pending checkpoint submissions",
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
      title: "Submit your photo",
      verification_methods: ["creator_approval"],
    })
    .returning();

  const submissionIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const submitter = await seedUser({
      display_name: `Doer ${i}`,
      nostr_pubkey: `doer_${i}`,
    });
    const participation = await seedParticipant(challenge.id, submitter.id, {
      status: "active",
    });
    const [row] = await testDb
      .insert(checkpoint_completions)
      .values({
        participant_id: participation.id,
        checkpoint_id: cp.id,
        content: `proof from doer ${i}`,
        status: "pending",
      })
      .returning();
    submissionIds.push(row.id);
    // space out created_at so ORDER BY is deterministic
    await new Promise((r) => setTimeout(r, 5));
  }
  return { challenge, cp, submissionIds };
}

describe("Integration: GET /api/challenges/[id]/pending-checkpoint-submissions", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ display_name: "Creator" });
  });

  it("returns a page of pending submissions to the creator", async () => {
    const { challenge } = await seedPendingChallenge(creator.id, 3);
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

    const res = await pendingRoute.GET(
      buildRequest(
        "GET",
        `/api/challenges/${challenge.id}/pending-checkpoint-submissions`
      ),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.items).toHaveLength(3);
    expect(body.data.nextCursor).toBeNull();
    // Oldest first so the creator works through the queue in order.
    expect(body.data.items[0].participant.user.display_name).toBe("Doer 0");
  });

  it("paginates via cursor when there are more rows than the limit", async () => {
    const { challenge } = await seedPendingChallenge(creator.id, 3);
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

    const first = await pendingRoute.GET(
      buildRequest(
        "GET",
        `/api/challenges/${challenge.id}/pending-checkpoint-submissions`,
        undefined,
        { limit: "2" }
      ),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const firstPage = await parseResponse(first);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.items).toHaveLength(2);
    expect(firstPage.body.data.nextCursor).toBeTruthy();

    const second = await pendingRoute.GET(
      buildRequest(
        "GET",
        `/api/challenges/${challenge.id}/pending-checkpoint-submissions`,
        undefined,
        { limit: "2", cursor: firstPage.body.data.nextCursor }
      ),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const secondPage = await parseResponse(second);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.nextCursor).toBeNull();

    // No overlap between pages.
    const firstIds = new Set(
      firstPage.body.data.items.map((s: { id: string }) => s.id)
    );
    for (const s of secondPage.body.data.items) {
      expect(firstIds.has(s.id)).toBe(false);
    }
  });

  it("rejects non-creators with 403", async () => {
    const { challenge } = await seedPendingChallenge(creator.id, 1);
    const outsider = await seedUser({ display_name: "Outsider" });
    setSession(makeSession(outsider.id));

    const res = await pendingRoute.GET(
      buildRequest(
        "GET",
        `/api/challenges/${challenge.id}/pending-checkpoint-submissions`
      ),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown challenge ids", async () => {
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
    const missingId = "00000000-0000-0000-0000-000000000000";
    const res = await pendingRoute.GET(
      buildRequest(
        "GET",
        `/api/challenges/${missingId}/pending-checkpoint-submissions`
      ),
      { params: Promise.resolve({ id: missingId }) }
    );
    expect(res.status).toBe(404);
  });
});
