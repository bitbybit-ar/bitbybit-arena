/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb } from "./setup";
import {
  setSession,
  seedUser,
  seedChallenge,
  buildRequest,
  parseResponse,
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

const popularTagsRoute = await import("@/app/api/tags/popular/route");
const challengesRoute = await import("@/app/api/challenges/route");

describe("Integration: GET /api/tags/popular", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator", display_name: "Creator" });
    setSession(null);
  });

  it("returns tags ordered by count descending", async () => {
    await seedChallenge(creator.id, { slug: "c1", tags: ["fitness", "running"] });
    await seedChallenge(creator.id, { slug: "c2", tags: ["fitness", "bitcoin"] });
    await seedChallenge(creator.id, { slug: "c3", tags: ["fitness"] });
    await seedChallenge(creator.id, { slug: "c4", tags: ["bitcoin"] });

    const res = await popularTagsRoute.GET(
      buildRequest("GET", "/api/tags/popular")
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { tag: "fitness", count: 3 },
      { tag: "bitcoin", count: 2 },
      { tag: "running", count: 1 },
    ]);
  });

  it("respects the limit query param", async () => {
    await seedChallenge(creator.id, { slug: "c1", tags: ["a", "b", "c"] });
    await seedChallenge(creator.id, { slug: "c2", tags: ["a", "b"] });
    await seedChallenge(creator.id, { slug: "c3", tags: ["a"] });

    const res = await popularTagsRoute.GET(
      buildRequest("GET", "/api/tags/popular", undefined, { limit: "2" })
    );
    const { body } = await parseResponse(res);

    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ tag: "a", count: 3 });
    expect(body.data[1]).toEqual({ tag: "b", count: 2 });
  });

  it("returns an empty list when no challenges exist", async () => {
    const res = await popularTagsRoute.GET(
      buildRequest("GET", "/api/tags/popular")
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("filters challenges list by multiple tags using OR logic", async () => {
    await seedChallenge(creator.id, { slug: "c1", title: "Fitness One", tags: ["fitness"] });
    await seedChallenge(creator.id, { slug: "c2", title: "Bitcoin One", tags: ["bitcoin"] });
    await seedChallenge(creator.id, { slug: "c3", title: "Reading One", tags: ["reading"] });

    const res = await challengesRoute.GET(
      buildRequest("GET", "/api/challenges", undefined, { tags: "fitness,bitcoin" })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    const titles = body.data.items.map((i: { title: string }) => i.title).sort();
    expect(titles).toEqual(["Bitcoin One", "Fitness One"]);
  });
});
