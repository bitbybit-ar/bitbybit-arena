/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb, testDb } from "./setup";
import { badges } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedChallenge,
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

const route = await import("@/app/api/my-badges/route");

describe("Integration: GET /api/my-badges", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let recipient: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({
      display_name: "Creator",
    });
    recipient = await seedUser({
      display_name: "Recipient",
    });
  });

  it("requires authentication", async () => {
    setSession(null);
    const res = await route.GET(buildRequest("GET", "/api/my-badges"));
    expect(res.status).toBe(401);
  });

  it("returns an empty array when the user has no badges", async () => {
    setSession(makeSession(recipient.id));
    const res = await route.GET(buildRequest("GET", "/api/my-badges"));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns badges joined with challenge + issuer, newest first", async () => {
    const challengeA = await seedChallenge(creator.id, {
      title: "Challenge A",
      slug: "challenge-a",
      badge_name: "Alpha Badge",
      badge_image_url: "https://blossom.example/alpha.png",
    });
    const challengeB = await seedChallenge(creator.id, {
      title: "Challenge B",
      slug: "challenge-b",
      badge_name: "Beta Badge",
    });

    // Older badge
    await testDb.insert(badges).values({
      challenge_id: challengeA.id,
      user_id: recipient.id,
      badge_name: "Alpha Badge",
      badge_image_url: "https://blossom.example/alpha.png",
      awarded_at: new Date(Date.now() - 60_000),
    });
    // Newer badge
    await testDb.insert(badges).values({
      challenge_id: challengeB.id,
      user_id: recipient.id,
      badge_name: "Beta Badge",
      badge_image_url: null,
      awarded_at: new Date(),
    });

    setSession(makeSession(recipient.id));
    const res = await route.GET(buildRequest("GET", "/api/my-badges"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].badge_name).toBe("Beta Badge");
    expect(body.data[1].badge_name).toBe("Alpha Badge");

    const alpha = body.data[1];
    expect(alpha.challenge.title).toBe("Challenge A");
    expect(alpha.challenge.slug).toBe("challenge-a");
    expect(alpha.issuer.display_name).toBe("Creator");
    expect(alpha.badge_image_url).toBe("https://blossom.example/alpha.png");
  });

  it("only returns badges awarded to the current user", async () => {
    const otherRecipient = await seedUser();
    const challenge = await seedChallenge(creator.id, {
      slug: "c-iso",
      title: "Isolation test",
    });

    await testDb.insert(badges).values({
      challenge_id: challenge.id,
      user_id: otherRecipient.id,
      badge_name: "Other's badge",
    });

    setSession(makeSession(recipient.id));
    const res = await route.GET(buildRequest("GET", "/api/my-badges"));
    const { body } = await parseResponse(res);
    expect(body.data).toEqual([]);
  });
});
