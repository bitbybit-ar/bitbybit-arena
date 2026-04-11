import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { VerificationMethod } from "@/lib/types";
import { sql } from "drizzle-orm";

// --- Users (Nostr-only auth) ---
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nostr_pubkey: varchar("nostr_pubkey", { length: 64 }).notNull().unique(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    display_name: varchar("display_name", { length: 100 }).notNull(),
    avatar_url: text("avatar_url"),
    about: text("about"),
    lightning_address: varchar("lightning_address", { length: 255 }),
    nostr_metadata: jsonb("nostr_metadata"),
    nostr_metadata_updated_at: timestamp("nostr_metadata_updated_at"),
    locale: varchar("locale", { length: 5 }).notNull().default("es"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_nostr_pubkey_idx").on(table.nostr_pubkey),
    index("users_username_idx").on(table.username),
  ]
);

// --- Challenges ---
export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creator_id: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    nostr_event_id: varchar("nostr_event_id", { length: 64 }),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    image_url: text("image_url"),
    type: varchar("type", { length: 20 }).notNull().default("one_time"), // one_time, streak, competition, race, creative
    category: varchar("category", { length: 50 }),
    goal: integer("goal"), // target number (e.g., 30 days, 5 books)
    unit: varchar("unit", { length: 30 }), // days, completions, points
    verification_methods: text("verification_methods")
      .array()
      .notNull()
      .default(sql`ARRAY['creator_approval']::text[]`)
      .$type<VerificationMethod[]>(),
    nostr_action_target_event_id: varchar("nostr_action_target_event_id", {
      length: 64,
    }),
    nostr_hashtag: varchar("nostr_hashtag", { length: 50 }),
    checkpoint_mode: varchar("checkpoint_mode", { length: 20 })
      .notNull()
      .default("none"), // none, sequential, parallel
    prize_amount_sats: integer("prize_amount_sats").default(0),
    prize_distribution: varchar("prize_distribution", { length: 30 }), // first_to_complete, winner_takes_all, split, tiered, none — drives zap payouts when prize_amount_sats > 0
    // NIP-57 + NIP-75 zap rewards
    zap_goal_event_id: varchar("zap_goal_event_id", { length: 64 }), // NIP-75 kind 9041 event id published by the creator to fund the prize
    rewards_paid_at: timestamp("rewards_paid_at"), // set when the creator finishes paying zaps to winners
    badge_nostr_event_id: varchar("badge_nostr_event_id", { length: 64 }),
    badge_name: varchar("badge_name", { length: 100 }),
    badge_image_url: text("badge_image_url"),
    status: varchar("status", { length: 20 }).notNull().default("open"), // open, in_progress, completed, cancelled
    starts_at: timestamp("starts_at"),
    ends_at: timestamp("ends_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("challenges_creator_idx").on(table.creator_id),
    index("challenges_status_idx").on(table.status),
    index("challenges_type_idx").on(table.type),
    index("challenges_ends_at_idx").on(table.ends_at),
  ]
);

// --- Participants ---
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge_id: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    nostr_event_id: varchar("nostr_event_id", { length: 64 }),
    progress: integer("progress").notNull().default(0),
    points: integer("points").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active, completed, withdrawn
    completed_at: timestamp("completed_at"),
    joined_at: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("participants_unique_idx").on(
      table.challenge_id,
      table.user_id
    ),
    index("participants_challenge_idx").on(table.challenge_id),
    index("participants_user_idx").on(table.user_id),
    index("participants_status_idx").on(table.status),
  ]
);

// --- Completions (proof submissions) ---
export const completions = pgTable(
  "completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge_id: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    nostr_event_id: varchar("nostr_event_id", { length: 64 }),
    step: integer("step"), // which step in a streak/multi-step challenge
    content: text("content"), // text description; null when verification_type='nostr_action'
    proof_event_id: varchar("proof_event_id", { length: 64 }), // nostr event id that proves the completion (e.g. kind:7 like)
    reward_zap_receipt_id: varchar("reward_zap_receipt_id", { length: 64 }), // NIP-57 kind 9735 zap receipt id after the creator pays the reward
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
    reviewed_by: uuid("reviewed_by").references(() => users.id),
    reviewed_at: timestamp("reviewed_at"),
    submitted_at: timestamp("submitted_at").notNull().defaultNow(),
  },
  (table) => [
    index("completions_challenge_idx").on(table.challenge_id),
    index("completions_user_idx").on(table.user_id),
    index("completions_status_idx").on(table.status),
    uniqueIndex("completions_proof_event_unique_idx")
      .on(table.challenge_id, table.user_id, table.proof_event_id)
      .where(sql`proof_event_id IS NOT NULL`),
  ]
);

// --- Challenge checkpoints (optional sub-tasks) ---
export const challenge_checkpoints = pgTable(
  "challenge_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge_id: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    verification_methods: text("verification_methods")
      .array()
      .notNull()
      .default(sql`ARRAY['creator_approval']::text[]`)
      .$type<VerificationMethod[]>(),
    nostr_action_target_event_id: varchar("nostr_action_target_event_id", {
      length: 64,
    }),
    nostr_hashtag: varchar("nostr_hashtag", { length: 50 }),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("checkpoints_challenge_idx").on(table.challenge_id),
    uniqueIndex("checkpoints_challenge_order_idx").on(
      table.challenge_id,
      table.order
    ),
  ]
);

// --- Checkpoint completions (per participant, per checkpoint) ---
export const checkpoint_completions = pgTable(
  "checkpoint_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participant_id: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    checkpoint_id: uuid("checkpoint_id")
      .notNull()
      .references(() => challenge_checkpoints.id, { onDelete: "cascade" }),
    proof_event_id: varchar("proof_event_id", { length: 64 }),
    content: text("content"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
    completed_at: timestamp("completed_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("checkpoint_completions_unique_idx").on(
      table.participant_id,
      table.checkpoint_id
    ),
    index("checkpoint_completions_checkpoint_idx").on(table.checkpoint_id),
  ]
);

// --- Badges awarded ---
export const badges = pgTable(
  "badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge_id: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    badge_name: varchar("badge_name", { length: 100 }).notNull(),
    badge_image_url: text("badge_image_url"),
    nostr_event_id: varchar("nostr_event_id", { length: 64 }), // kind:8 badge award event
    awarded_at: timestamp("awarded_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("badges_unique_idx").on(table.challenge_id, table.user_id),
    index("badges_user_idx").on(table.user_id),
  ]
);

// --- Notifications ---
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 30 }).notNull(), // challenge_joined, completion_submitted, completion_verified, prize_awarded, badge_earned
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    read: boolean("read").notNull().default(false),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_idx").on(table.user_id),
    index("notifications_read_idx").on(table.user_id, table.read),
  ]
);
