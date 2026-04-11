import { NextRequest } from "next/server";
import { testDb } from "./setup";
import { users, challenges, participants, completions } from "@/lib/db/schema";

// ----- Session ref (accessible from hoisted vi.mock factories) -----

export const sessionRef: { current: Record<string, unknown> | null } = { current: null };

export function setSession(session: Record<string, unknown> | null) {
  sessionRef.current = session;
}

// ----- Seed factories (write to real DB) -----

export async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await testDb
    .insert(users)
    .values({
      nostr_pubkey: overrides.nostr_pubkey ?? `pk_${crypto.randomUUID().slice(0, 16)}`,
      username: overrides.username ?? `user_${Date.now()}`,
      display_name: overrides.display_name ?? "Test User",
      ...overrides,
    })
    .returning();
  return user;
}

export async function seedChallenge(
  creatorId: string,
  overrides: Partial<typeof challenges.$inferInsert> = {}
) {
  const slug = overrides.slug ?? `challenge-${Date.now()}`;
  const [challenge] = await testDb
    .insert(challenges)
    .values({
      creator_id: creatorId,
      slug,
      title: overrides.title ?? "Test Challenge",
      description: overrides.description ?? "A test challenge description",
      type: "one_time",
      verification_methods: ["creator_approval"],
      ...overrides,
    })
    .returning();
  return challenge;
}

export async function seedParticipant(
  challengeId: string,
  userId: string,
  overrides: Partial<typeof participants.$inferInsert> = {}
) {
  const [participant] = await testDb
    .insert(participants)
    .values({
      challenge_id: challengeId,
      user_id: userId,
      ...overrides,
    })
    .returning();
  return participant;
}

export async function seedCompletion(
  challengeId: string,
  userId: string,
  overrides: Partial<typeof completions.$inferInsert> = {}
) {
  const [completion] = await testDb
    .insert(completions)
    .values({
      challenge_id: challengeId,
      user_id: userId,
      content: overrides.content ?? "I completed the challenge!",
      ...overrides,
    })
    .returning();
  return completion;
}

// ----- Session factory -----

export function makeSession(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    username: "testuser",
    display_name: "Test User",
    avatar_url: null,
    locale: "es",
    nostr_pubkey: "test_pubkey",
    ...overrides,
  };
}

// ----- Request builder -----

export function buildRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ----- Response parser -----

export async function parseResponse(response: Response) {
  const json = await response.json();
  return { status: response.status, body: json };
}
