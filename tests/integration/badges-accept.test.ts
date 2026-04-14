/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { badges } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedChallenge,
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

const route = await import("@/app/api/badges/[id]/route");

describe("Integration: PATCH /api/badges/[id]", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let recipient: Awaited<ReturnType<typeof seedUser>>;
  let someoneElse: Awaited<ReturnType<typeof seedUser>>;
  let badgeId: string;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator" });
    recipient = await seedUser({ username: "recipient" });
    someoneElse = await seedUser({ username: "nosey" });
    const challenge = await seedChallenge(creator.id, {
      slug: "accept-test",
      title: "Accept test",
      badge_name: "Test badge",
    });
    const [row] = await testDb
      .insert(badges)
      .values({
        challenge_id: challenge.id,
        user_id: recipient.id,
        badge_name: "Test badge",
      })
      .returning();
    badgeId = row.id;
  });

  it("recipient can mark their own badge as accepted", async () => {
    setSession(makeSession(recipient.id));
    const res = await route.PATCH(
      buildRequest("PATCH", `/api/badges/${badgeId}`),
      { params: Promise.resolve({ id: badgeId }) }
    );
    expect(res.status).toBe(200);

    const [row] = await testDb
      .select()
      .from(badges)
      .where(eq(badges.id, badgeId));
    expect(row.accepted_at).not.toBeNull();
  });

  it("403 when someone else tries to accept the badge", async () => {
    setSession(makeSession(someoneElse.id));
    const res = await route.PATCH(
      buildRequest("PATCH", `/api/badges/${badgeId}`),
      { params: Promise.resolve({ id: badgeId }) }
    );
    expect(res.status).toBe(403);
  });

  it("404 for a non-existent badge", async () => {
    setSession(makeSession(recipient.id));
    const missing = "00000000-0000-0000-0000-000000000000";
    const res = await route.PATCH(
      buildRequest("PATCH", `/api/badges/${missing}`),
      { params: Promise.resolve({ id: missing }) }
    );
    expect(res.status).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    setSession(null);
    const res = await route.PATCH(
      buildRequest("PATCH", `/api/badges/${badgeId}`),
      { params: Promise.resolve({ id: badgeId }) }
    );
    expect(res.status).toBe(401);
  });
});
