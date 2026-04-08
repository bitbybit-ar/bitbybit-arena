/**
 * Test helpers for API route testing.
 *
 * Mock getDb() and getSession() at module level, then call route handlers
 * with NextRequest objects. Tests the full handler logic without hitting a real DB.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";

// --- Mock state (shared across tests) ---

export const mockState = {
  session: null as Record<string, unknown> | null,
  dbRows: [] as unknown[],
  mutationResult: [] as unknown[],
};

export function setSession(session: Record<string, unknown> | null) {
  mockState.session = session;
}

export function setDbRows(rows: unknown[]) {
  mockState.dbRows = rows;
}

export function setMutationResult(result: unknown[]) {
  mockState.mutationResult = result;
}

// --- Session factory ---

export function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-creator",
    username: "creator",
    display_name: "Creator User",
    avatar_url: null,
    locale: "es",
    nostr_pubkey: "abc123pubkey",
    ...overrides,
  };
}

// --- Reusable DB mock setup ---

export function setupDbMock() {
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(mockState.dbRows);
    return chain;
  };

  const mutationChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["values", "set", "where"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.returning = vi.fn(() => Promise.resolve(mockState.mutationResult));
    chain.then = (resolve: (v: unknown) => void) => resolve(undefined);
    return chain;
  };

  return {
    getDb: vi.fn(() => ({
      select: vi.fn(() => selectChain()),
      insert: vi.fn(() => mutationChain()),
      update: vi.fn(() => mutationChain()),
      delete: vi.fn(() => mutationChain()),
    })),
    challenges: {},
    participants: {},
    completions: {},
    users: {},
    badges: {},
    notifications: {},
  };
}

// --- Request builder ---

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

// --- Response parser ---

export async function parseResponse(response: Response) {
  const json = await response.json();
  return { status: response.status, body: json };
}

// --- Row factories ---

let idCounter = 0;
export function resetIdCounter() { idCounter = 0; }

export function makeChallenge(overrides: Record<string, unknown> = {}) {
  const id = overrides.id || `challenge-${++idCounter}`;
  return {
    id,
    creator_id: "user-creator",
    slug: `test-challenge-${idCounter}`,
    title: "Test Challenge",
    description: "A test challenge description that is long enough",
    image_url: null,
    type: "one_time",
    category: null,
    goal: null,
    unit: null,
    verification_type: "creator_approval",
    prize_amount_sats: 0,
    prize_distribution: "none",
    badge_nostr_event_id: null,
    badge_name: null,
    badge_image_url: null,
    status: "open",
    starts_at: null,
    ends_at: null,
    nostr_event_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || `participant-${++idCounter}`,
    challenge_id: "challenge-1",
    user_id: "user-participant",
    nostr_event_id: null,
    progress: 0,
    points: 0,
    status: "active",
    completed_at: null,
    joined_at: new Date(),
    ...overrides,
  };
}

export function makeCompletion(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || `completion-${++idCounter}`,
    challenge_id: "challenge-1",
    user_id: "user-participant",
    nostr_event_id: null,
    step: null,
    content: "I completed the challenge",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    submitted_at: new Date(),
    ...overrides,
  };
}

export function makeUser(overrides: Record<string, unknown> = {}) {
  const id = overrides.id || `user-${++idCounter}`;
  return {
    id,
    nostr_pubkey: `pubkey-${id}`,
    username: `user${idCounter}`,
    display_name: `User ${idCounter}`,
    avatar_url: null,
    ...overrides,
  };
}
