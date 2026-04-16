/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb } from "./setup";
import {
  setSession, makeSession,
  seedUser, seedChallenge, seedParticipant,
  buildRequest, parseResponse,
} from "./helpers";

vi.mock("@/lib/auth", async () => {
  const { sessionRef: ref } = await import("./helpers");
  return {
    getSession: vi.fn(() => Promise.resolve(ref.current)),
    AuthSession: {},
  };
});

vi.mock("@/lib/db", async () => {
  const { testDb } = await import("./setup");
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return { getDb: vi.fn(() => testDb), ...schema };
});

const challengesRoute = await import("@/app/api/challenges/route");

const HEX = (seed: string) => seed.padEnd(64, "0").slice(0, 64);

describe("Integration: GET /api/challenges follow boost", () => {
  // Pubkeys must be 64-char hex; the API filters out anything that
  // doesn't match HEX_64, and the route lower-cases incoming values.
  const followedCreatorPk = HEX("aa");
  const followedParticipantPk = HEX("bb");
  const unrelatedCreatorPk = HEX("cc");

  beforeEach(async () => {
    await cleanDb();
  });

  it("ranks followed-creator and followed-participant challenges before others", async () => {
    const followedCreator = await seedUser({ nostr_pubkey: followedCreatorPk });
    const followedParticipant = await seedUser({ nostr_pubkey: followedParticipantPk });
    const unrelatedCreator = await seedUser({ nostr_pubkey: unrelatedCreatorPk });

    // Seed in oldest → newest so the natural created_at sort would put
    // "Unrelated newest" on top — the boost has to override that.
    const followedByCreator = await seedChallenge(followedCreator.id, {
      title: "Followed creator",
      slug: "followed-creator",
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    const withFollowedParticipant = await seedChallenge(unrelatedCreator.id, {
      title: "Followed participant",
      slug: "followed-participant",
      created_at: new Date("2026-02-01T00:00:00Z"),
    });
    await seedParticipant(withFollowedParticipant.id, followedParticipant.id, {
      status: "active",
    });
    const unrelated = await seedChallenge(unrelatedCreator.id, {
      title: "Unrelated newest",
      slug: "unrelated-newest",
      created_at: new Date("2026-03-01T00:00:00Z"),
    });

    setSession(null);
    const res = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, {
        follow_pubkeys: `${followedCreatorPk},${followedParticipantPk}`,
      })
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);

    const titles = body.data.items.map((c: { title: string }) => c.title);
    // Followed first (newest among followed first), then the rest.
    expect(titles).toEqual([
      "Followed participant", // followed AND newer than the other followed
      "Followed creator",
      "Unrelated newest",
    ]);
    // Sanity: ids match what we seeded.
    expect(body.data.items.map((c: { id: string }) => c.id)).toEqual([
      withFollowedParticipant.id,
      followedByCreator.id,
      unrelated.id,
    ]);
  });

  it("only_following=true hard-filters to followed rows", async () => {
    const followedCreator = await seedUser({ nostr_pubkey: followedCreatorPk });
    const unrelatedCreator = await seedUser({ nostr_pubkey: unrelatedCreatorPk });

    await seedChallenge(followedCreator.id, {
      title: "Followed",
      slug: "followed-only",
    });
    await seedChallenge(unrelatedCreator.id, {
      title: "Unrelated",
      slug: "unrelated-only",
    });

    setSession(null);
    const res = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, {
        follow_pubkeys: followedCreatorPk,
        only_following: "true",
      })
    );
    const { body } = await parseResponse(res);

    const titles = body.data.items.map((c: { title: string }) => c.title);
    expect(titles).toEqual(["Followed"]);
  });

  it("ignores withdrawn participants when computing the follow boost", async () => {
    const followedParticipant = await seedUser({ nostr_pubkey: followedParticipantPk });
    const unrelatedCreator = await seedUser({ nostr_pubkey: unrelatedCreatorPk });

    // Followed user is in the participants table but withdrawn — the
    // challenge should NOT be lifted to the top, otherwise leaving a
    // challenge would still pollute everyone's feed indefinitely.
    const ghosted = await seedChallenge(unrelatedCreator.id, {
      title: "Withdrawn participant",
      slug: "withdrawn-participant",
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    await seedParticipant(ghosted.id, followedParticipant.id, {
      status: "withdrawn",
    });
    await seedChallenge(unrelatedCreator.id, {
      title: "Plain newest",
      slug: "plain-newest",
      created_at: new Date("2026-02-01T00:00:00Z"),
    });

    setSession(null);
    const res = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, {
        follow_pubkeys: followedParticipantPk,
      })
    );
    const { body } = await parseResponse(res);

    const titles = body.data.items.map((c: { title: string }) => c.title);
    // Pure created_at order — neither row is "followed" once withdrawn
    // is excluded.
    expect(titles).toEqual(["Plain newest", "Withdrawn participant"]);
  });

  it("uses offset-based cursor when follow boost is active", async () => {
    const followedCreator = await seedUser({ nostr_pubkey: followedCreatorPk });
    setSession(makeSession(followedCreator.id, { nostr_pubkey: followedCreatorPk }));

    // Seed 3 challenges all created by the followed user, then page
    // through with limit=2 to confirm the cursor is an integer offset
    // and not an ISO timestamp.
    for (let i = 0; i < 3; i++) {
      await seedChallenge(followedCreator.id, {
        title: `Challenge ${i}`,
        slug: `challenge-${i}`,
        created_at: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      });
    }

    const firstPage = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, {
        follow_pubkeys: followedCreatorPk,
        limit: "2",
      })
    );
    const { body: firstBody } = await parseResponse(firstPage);
    expect(firstBody.data.items).toHaveLength(2);
    expect(firstBody.data.nextCursor).toBe("2"); // offset, not a timestamp

    const secondPage = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, {
        follow_pubkeys: followedCreatorPk,
        limit: "2",
        cursor: firstBody.data.nextCursor,
      })
    );
    const { body: secondBody } = await parseResponse(secondPage);
    expect(secondBody.data.items).toHaveLength(1);
    expect(secondBody.data.nextCursor).toBeNull();
  });
});
