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

const route = await import("@/app/api/notifications/route");

async function seedNotification(
  userId: string,
  overrides: Partial<typeof notifications.$inferInsert> = {}
) {
  const [row] = await testDb
    .insert(notifications)
    .values({
      user_id: userId,
      type: "challenge_joined",
      title: "Test",
      body: "Test body",
      ...overrides,
    })
    .returning();
  return row;
}

describe("Integration: Notifications", () => {
  let owner: Awaited<ReturnType<typeof seedUser>>;
  let other: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    owner = await seedUser({ display_name: "Owner" });
    other = await seedUser({ display_name: "Other" });
  });

  describe("GET /api/notifications", () => {
    it("returns only the caller's notifications, newest first", async () => {
      const oldRow = await seedNotification(owner.id, { title: "older" });
      // Small delay to guarantee distinct created_at ordering on the DB
      // clock — TRUNCATE + back-to-back inserts can land in the same tick.
      await new Promise((r) => setTimeout(r, 10));
      const newRow = await seedNotification(owner.id, { title: "newer" });
      await seedNotification(other.id, { title: "foreign" });

      setSession(makeSession(owner.id));
      const res = await route.GET(buildRequest("GET", "/api/notifications"));
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe(newRow.id);
      expect(body.data[1].id).toBe(oldRow.id);
    });

    it("filters to unread only when ?unread=true", async () => {
      await seedNotification(owner.id, { title: "read", read: true });
      const unreadRow = await seedNotification(owner.id, { title: "unread" });

      setSession(makeSession(owner.id));
      const res = await route.GET(
        buildRequest("GET", "/api/notifications", undefined, { unread: "true" })
      );
      const { body } = await parseResponse(res);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(unreadRow.id);
    });

    it("returns 401 when not authenticated", async () => {
      setSession(null);
      const res = await route.GET(buildRequest("GET", "/api/notifications"));
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/notifications", () => {
    it("marks the caller's notification as read", async () => {
      const row = await seedNotification(owner.id);

      setSession(makeSession(owner.id));
      const res = await route.PATCH(
        buildRequest("PATCH", "/api/notifications", { id: row.id })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.read).toBe(true);

      const [refetched] = await testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, row.id));
      expect(refetched.read).toBe(true);
    });

    it("does not let users mark someone else's notification read", async () => {
      const foreign = await seedNotification(other.id);

      setSession(makeSession(owner.id));
      const res = await route.PATCH(
        buildRequest("PATCH", "/api/notifications", { id: foreign.id })
      );

      expect(res.status).toBe(404);

      const [refetched] = await testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, foreign.id));
      expect(refetched.read).toBe(false);
    });

    it("rejects an invalid uuid with 400", async () => {
      setSession(makeSession(owner.id));
      const res = await route.PATCH(
        buildRequest("PATCH", "/api/notifications", { id: "not-a-uuid" })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/notifications (mark all read)", () => {
    it("flips every unread row for the caller and leaves foreign rows untouched", async () => {
      await seedNotification(owner.id, { title: "a" });
      await seedNotification(owner.id, { title: "b" });
      const foreign = await seedNotification(other.id, { title: "c" });

      setSession(makeSession(owner.id));
      const res = await route.POST(
        buildRequest("POST", "/api/notifications")
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.ok).toBe(true);

      const myRows = await testDb
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, owner.id));
      expect(myRows.every((r) => r.read)).toBe(true);

      const [foreignRow] = await testDb
        .select()
        .from(notifications)
        .where(eq(notifications.id, foreign.id));
      expect(foreignRow.read).toBe(false);
    });
  });
});
