/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { notifications } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedChallenge,
  seedParticipant,
  seedCompletion,
  buildRequest,
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

const joinRoute = await import("@/app/api/challenges/[id]/join/route");
const completionsRoute = await import(
  "@/app/api/challenges/[id]/completions/route"
);
const verifyRoute = await import("@/app/api/completions/[id]/verify/route");
const awardRoute = await import("@/app/api/challenges/[id]/award/route");

async function getNotificationsFor(userId: string) {
  return testDb
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId));
}

describe("Notification emission at domain events", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;
  let challenge: Awaited<ReturnType<typeof seedChallenge>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ display_name: "Creator" });
    participant = await seedUser({ display_name: "Player One" });
    challenge = await seedChallenge(creator.id, {
      title: "Emit Test",
      status: "open",
      verification_methods: ["creator_approval"],
      goal: 1,
      badge_name: "Test Badge",
    });
  });

  it("emits challenge_joined to the creator when someone joins", async () => {
    setSession(makeSession(participant.id, { display_name: "Player One" }));
    await joinRoute.POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/join`),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    const creatorNotifs = await getNotificationsFor(creator.id);
    expect(creatorNotifs).toHaveLength(1);
    expect(creatorNotifs[0].type).toBe("challenge_joined");
    expect(creatorNotifs[0].metadata).toMatchObject({
      name: "Player One",
      challenge: "Emit Test",
    });

    // Self-join shouldn't ping the creator.
    const selfNotifs = await getNotificationsFor(participant.id);
    expect(selfNotifs).toHaveLength(0);
  });

  it("does not emit challenge_joined when the creator joins their own challenge", async () => {
    setSession(makeSession(creator.id, { display_name: "Creator" }));
    await joinRoute.POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/join`),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    const creatorNotifs = await getNotificationsFor(creator.id);
    expect(creatorNotifs).toHaveLength(0);
  });

  it("emits completion_submitted to the creator for pending proofs", async () => {
    await seedParticipant(challenge.id, participant.id, { status: "active" });
    setSession(makeSession(participant.id, { display_name: "Player One" }));

    await completionsRoute.POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
        content: "Here is my proof of completion",
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    const creatorNotifs = await getNotificationsFor(creator.id);
    expect(creatorNotifs).toHaveLength(1);
    expect(creatorNotifs[0].type).toBe("completion_submitted");
  });

  it("emits completion_verified with status metadata when the creator verifies", async () => {
    await seedParticipant(challenge.id, participant.id, { status: "active" });
    const completion = await seedCompletion(challenge.id, participant.id, {
      status: "pending",
    });

    setSession(makeSession(creator.id, { display_name: "Creator" }));
    await verifyRoute.POST(
      buildRequest("POST", `/api/completions/${completion.id}/verify`, {
        status: "approved",
      }),
      { params: Promise.resolve({ id: completion.id }) }
    );

    const participantNotifs = await getNotificationsFor(participant.id);
    expect(participantNotifs).toHaveLength(1);
    expect(participantNotifs[0].type).toBe("completion_verified");
    expect(participantNotifs[0].metadata).toMatchObject({ status: "approved" });
  });

  it("emits badge_earned to each awarded user", async () => {
    await seedParticipant(challenge.id, participant.id, { status: "active" });

    setSession(makeSession(creator.id));
    await awardRoute.POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [participant.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    const participantNotifs = await getNotificationsFor(participant.id);
    expect(participantNotifs).toHaveLength(1);
    expect(participantNotifs[0].type).toBe("badge_earned");
    expect(participantNotifs[0].metadata).toMatchObject({
      badge: "Test Badge",
      challenge: "Emit Test",
    });
  });
});
