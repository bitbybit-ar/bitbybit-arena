import { config } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  challenges,
  participants,
  completions,
  challenge_checkpoints,
  checkpoint_completions,
  badges,
} from "@/lib/db/schema";
import type { VerificationMethod } from "@/lib/types";

config({ path: ".env.local" });
config({ path: ".env" });

const MOCK_PREFIX = "mock-";

type MockUser = {
  pubkey: string;
  username: string;
  display_name: string;
  about: string;
  avatar: string;
};

// Real account pubkey — hex-decoded from
// npub12pluyzs2n3kxvx6t8fsqaa8j23f4n7syy45fny0cah46uaxqm5pqgfgy5m
const REAL_USER_PUBKEY =
  "507fc20a0a9c6c661b4b3a600ef4f2545359fa0425689991f8edebae74c0dd02";
const REAL_USER_KEY = "__real__";

const MOCK_USERS: MockUser[] = [
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a1",
    username: "mock-aria-storm",
    display_name: "Aria Storm",
    about: "Runner, climber, nostr-curious.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=aria",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a2",
    username: "mock-kaito-mori",
    display_name: "Kaito Mori",
    about: "Coder, chess nerd.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=kaito",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a3",
    username: "mock-luna-ibarra",
    display_name: "Luna Ibarra",
    about: "Artist, tinkerer.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=luna",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a4",
    username: "mock-diego-rocha",
    display_name: "Diego Rocha",
    about: "Buenos Aires. Cyclist.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=diego",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a5",
    username: "mock-mira-vex",
    display_name: "Mira Vex",
    about: "Reader. Reviewer.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=mira",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a6",
    username: "mock-sato-kenji",
    display_name: "Sato Kenji",
    about: "Cooks, climbs, commits.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=sato",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a7",
    username: "mock-nora-ocean",
    display_name: "Nora Ocean",
    about: "Open source + surf.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=nora",
  },
  {
    pubkey: "00000000000000000000000000000000000000000000000000000000000000a8",
    username: "mock-pablo-ruiz",
    display_name: "Pablo Ruiz",
    about: "Gym rat. Plant dad.",
    avatar: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=pablo",
  },
];

type MockChallenge = {
  slug: string;
  creator: string;
  title: string;
  description: string;
  type: "one_time" | "streak" | "competition" | "race" | "creative";
  category: string;
  verification_methods: VerificationMethod[];
  nostr_hashtag?: string;
  checkpoint_mode: "none" | "sequential" | "parallel";
  goal?: number;
  unit?: string;
  prize_amount_sats?: number;
  prize_distribution?: "first_to_complete" | "winner_takes_all" | "split" | "tiered" | "none";
  ends_in_days?: number;
  badge_name?: string;
  checkpoints?: { title: string; description: string }[];
  participants: { username: string; progress: number; points: number; status?: "active" | "completed" | "withdrawn" }[];
};

const MOCK_CHALLENGES: MockChallenge[] = [
  {
    slug: `${MOCK_PREFIX}30-day-run-streak`,
    creator: "mock-aria-storm",
    title: "30-Day Running Streak",
    description:
      "Run at least 2km every day for 30 consecutive days. Post a screenshot of your tracker as proof. Streak resets to zero if you skip a day.",
    type: "streak",
    category: "fitness",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "none",
    goal: 30,
    unit: "days",
    ends_in_days: 30,
    badge_name: "Iron Legs",
    participants: [
      { username: "mock-diego-rocha", progress: 22, points: 220 },
      { username: "mock-pablo-ruiz", progress: 18, points: 180 },
      { username: "mock-nora-ocean", progress: 12, points: 120 },
      { username: "mock-sato-kenji", progress: 7, points: 70 },
      { username: REAL_USER_KEY, progress: 14, points: 140 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}like-lacrypta-post`,
    creator: "mock-kaito-mori",
    title: "Boost La Crypta on Nostr",
    description:
      "React with a zap or like to the pinned La Crypta announcement. Verification is automatic — once your Nostr event hits the relays, you're in.",
    type: "one_time",
    category: "social",
    verification_methods: ["nostr_action"],
    checkpoint_mode: "none",
    ends_in_days: 7,
    participants: [
      { username: "mock-aria-storm", progress: 1, points: 10, status: "completed" },
      { username: "mock-luna-ibarra", progress: 1, points: 10, status: "completed" },
      { username: "mock-mira-vex", progress: 1, points: 10, status: "completed" },
      { username: "mock-nora-ocean", progress: 0, points: 0 },
      { username: "mock-pablo-ruiz", progress: 0, points: 0 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}read-5-books`,
    creator: "mock-mira-vex",
    title: "Read 5 Books This Quarter",
    description:
      "Finish 5 books before the end of the quarter. Submit a text review of each one. Any genre counts, re-reads don't.",
    type: "streak",
    category: "learning",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "parallel",
    goal: 5,
    unit: "books",
    ends_in_days: 60,
    checkpoints: [
      { title: "Book 1", description: "Finish and review your first book." },
      { title: "Book 2", description: "Finish and review your second book." },
      { title: "Book 3", description: "Finish and review your third book." },
      { title: "Book 4", description: "Finish and review your fourth book." },
      { title: "Book 5", description: "Finish and review your fifth book." },
    ],
    participants: [
      { username: "mock-kaito-mori", progress: 3, points: 60 },
      { username: "mock-luna-ibarra", progress: 2, points: 40 },
      { username: "mock-aria-storm", progress: 1, points: 20 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}buenos-aires-cycle-race`,
    creator: "mock-diego-rocha",
    title: "Buenos Aires 100km Race",
    description:
      "First person to log 100km of cycling in Buenos Aires wins the full pot. Post your ride summary to claim checkpoints. Race ends when the first rider hits 100km.",
    type: "race",
    category: "fitness",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "sequential",
    goal: 100,
    unit: "km",
    prize_amount_sats: 50000,
    prize_distribution: "first_to_complete",
    ends_in_days: 14,
    badge_name: "BA Road Warrior",
    checkpoints: [
      { title: "25km", description: "Quarter way there." },
      { title: "50km", description: "Halfway mark." },
      { title: "75km", description: "Three-quarters done." },
      { title: "100km", description: "Cross the finish line." },
    ],
    participants: [
      { username: "mock-pablo-ruiz", progress: 72, points: 720 },
      { username: "mock-sato-kenji", progress: 48, points: 480 },
      { username: "mock-aria-storm", progress: 30, points: 300 },
      { username: "mock-nora-ocean", progress: 12, points: 120 },
      { username: REAL_USER_KEY, progress: 55, points: 550 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}ship-open-source`,
    creator: "mock-nora-ocean",
    title: "Ship an Open Source Project",
    description:
      "Create something real, publish it on GitHub, and post the link. The top 3 projects (by zap votes) split the reward pot.",
    type: "competition",
    category: "coding",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "none",
    prize_amount_sats: 120000,
    prize_distribution: "tiered",
    ends_in_days: 21,
    badge_name: "Shipper",
    participants: [
      { username: "mock-kaito-mori", progress: 1, points: 100 },
      { username: "mock-sato-kenji", progress: 1, points: 100 },
      { username: "mock-luna-ibarra", progress: 1, points: 100 },
      { username: "mock-mira-vex", progress: 0, points: 0 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}pixel-art-collab`,
    creator: "mock-luna-ibarra",
    title: "Pixel Art Weekend",
    description:
      "Make one piece of pixel art per day for the weekend. Share it on nostr with #pixelart. The jury picks one winner to take the full pot.",
    type: "creative",
    category: "creativity",
    verification_methods: ["nostr_action"],
    checkpoint_mode: "parallel",
    prize_amount_sats: 25000,
    prize_distribution: "winner_takes_all",
    ends_in_days: 3,
    checkpoints: [
      { title: "Friday piece", description: "Post your Friday pixel." },
      { title: "Saturday piece", description: "Post your Saturday pixel." },
      { title: "Sunday piece", description: "Post your Sunday pixel." },
    ],
    participants: [
      { username: "mock-aria-storm", progress: 2, points: 40 },
      { username: "mock-diego-rocha", progress: 1, points: 20 },
      { username: "mock-mira-vex", progress: 1, points: 20 },
      { username: "mock-pablo-ruiz", progress: 0, points: 0 },
      { username: "mock-sato-kenji", progress: 0, points: 0 },
      { username: "mock-kaito-mori", progress: 0, points: 0 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}cook-7-recipes`,
    creator: "mock-sato-kenji",
    title: "Cook 7 Recipes From Scratch",
    description:
      "Pick seven recipes you've never cooked before and make them within two weeks. Submit a plate shot description for each.",
    type: "streak",
    category: "cooking",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "sequential",
    goal: 7,
    unit: "recipes",
    ends_in_days: 14,
    badge_name: "Kitchen Quest",
    checkpoints: [
      { title: "Recipe 1", description: "Cook and describe your first new recipe." },
      { title: "Recipe 2", description: "Cook and describe your second." },
      { title: "Recipe 3", description: "Cook and describe your third." },
      { title: "Recipe 4", description: "Cook and describe your fourth." },
      { title: "Recipe 5", description: "Cook and describe your fifth." },
      { title: "Recipe 6", description: "Cook and describe your sixth." },
      { title: "Recipe 7", description: "Cook and describe your seventh." },
    ],
    participants: [
      { username: "mock-mira-vex", progress: 4, points: 80 },
      { username: "mock-luna-ibarra", progress: 2, points: 40 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}meditate-21-days`,
    creator: "mock-pablo-ruiz",
    title: "21 Days of Meditation",
    description:
      "Sit for at least 10 minutes every morning, 21 days in a row. Honor system — just log that you did it.",
    type: "streak",
    category: "wellness",
    verification_methods: ["automatic"],
    checkpoint_mode: "none",
    goal: 21,
    unit: "days",
    ends_in_days: 21,
    participants: [
      { username: "mock-aria-storm", progress: 15, points: 150 },
      { username: "mock-nora-ocean", progress: 9, points: 90 },
      { username: "mock-diego-rocha", progress: 6, points: 60 },
      { username: "mock-luna-ibarra", progress: 3, points: 30 },
      { username: REAL_USER_KEY, progress: 11, points: 110 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}hackathon-2-la-crypta`,
    creator: REAL_USER_KEY,
    title: "Hackathon #2 de La Crypta — Nostr",
    description:
      "Construí un proyecto sobre Nostr durante el Hackathon #2 de La Crypta. Publicá tu proyecto en Nostr (nota kind:1) con el hashtag #arenahackathon para registrarlo automáticamente, o mandá el link por aprobación manual. Todos los participantes válidos reciben la badge. Los 3 proyectos con más votos del jurado se llevan el pozo en zaps.",
    type: "competition",
    category: "hackathon",
    verification_methods: ["nostr_hashtag", "creator_approval"],
    nostr_hashtag: "arenahackathon",
    checkpoint_mode: "none",
    prize_amount_sats: 300000,
    prize_distribution: "tiered",
    ends_in_days: 14,
    badge_name: "Hackathon #2 — La Crypta",
    participants: [
      { username: "mock-kaito-mori", progress: 1, points: 100 },
      { username: "mock-nora-ocean", progress: 1, points: 100 },
      { username: "mock-luna-ibarra", progress: 0, points: 0 },
      { username: "mock-sato-kenji", progress: 0, points: 0 },
      { username: "mock-mira-vex", progress: 0, points: 0 },
    ],
  },
  {
    slug: `${MOCK_PREFIX}write-daily-journal`,
    creator: REAL_USER_KEY,
    title: "Daily Journal — 14 Days",
    description:
      "Write at least one paragraph in your journal every day for two weeks. Share a highlight line each day as proof.",
    type: "streak",
    category: "wellness",
    verification_methods: ["creator_approval"],
    checkpoint_mode: "none",
    goal: 14,
    unit: "days",
    ends_in_days: 14,
    badge_name: "Daily Scribe",
    participants: [
      { username: "mock-mira-vex", progress: 9, points: 90 },
      { username: "mock-luna-ibarra", progress: 6, points: 60 },
      { username: "mock-aria-storm", progress: 4, points: 40 },
      { username: "mock-kaito-mori", progress: 2, points: 20 },
    ],
  },
];

async function main() {
  const db = getDb();

  console.log("Wiping prior mock rows");
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.username, `${MOCK_PREFIX}%`));
  const existingUserIds = existingUsers.map((u) => u.id);

  const existingChallenges = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(like(challenges.slug, `${MOCK_PREFIX}%`));
  const existingChallengeIds = existingChallenges.map((c) => c.id);

  if (existingChallengeIds.length > 0) {
    const existingParticipants = await db
      .select({ id: participants.id })
      .from(participants)
      .where(inArray(participants.challenge_id, existingChallengeIds));
    const existingParticipantIds = existingParticipants.map((p) => p.id);
    if (existingParticipantIds.length > 0) {
      await db
        .delete(checkpoint_completions)
        .where(inArray(checkpoint_completions.participant_id, existingParticipantIds));
    }
    await db
      .delete(completions)
      .where(inArray(completions.challenge_id, existingChallengeIds));
    await db
      .delete(badges)
      .where(inArray(badges.challenge_id, existingChallengeIds));
    await db
      .delete(participants)
      .where(inArray(participants.challenge_id, existingChallengeIds));
    await db
      .delete(challenge_checkpoints)
      .where(inArray(challenge_checkpoints.challenge_id, existingChallengeIds));
    await db
      .delete(challenges)
      .where(inArray(challenges.id, existingChallengeIds));
  }
  if (existingUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, existingUserIds));
  }

  console.log(`Inserting ${MOCK_USERS.length} mock users`);
  const insertedUsers = await db
    .insert(users)
    .values(
      MOCK_USERS.map((u) => ({
        nostr_pubkey: u.pubkey,
        username: u.username,
        display_name: u.display_name,
        about: u.about,
        avatar_url: u.avatar,
        locale: "es",
      })),
    )
    .returning();

  // Find-or-create the real user (by pubkey, so if the account already exists
  // from a prior login we reuse that row instead of conflicting).
  const [existingReal] = await db
    .select()
    .from(users)
    .where(eq(users.nostr_pubkey, REAL_USER_PUBKEY));
  const realUser =
    existingReal ??
    (
      await db
        .insert(users)
        .values({
          nostr_pubkey: REAL_USER_PUBKEY,
          username: `analia-${REAL_USER_PUBKEY.slice(0, 6)}`,
          display_name: "Analia",
          locale: "es",
        })
        .returning()
    )[0];

  const userByUsername = new Map<string, (typeof insertedUsers)[number]>();
  for (const u of insertedUsers) userByUsername.set(u.username, u);
  userByUsername.set(REAL_USER_KEY, realUser);

  console.log(`Inserting ${MOCK_CHALLENGES.length} mock challenges`);
  for (const mc of MOCK_CHALLENGES) {
    const creator = userByUsername.get(mc.creator);
    if (!creator) throw new Error(`Missing creator ${mc.creator}`);

    const endsAt = mc.ends_in_days
      ? new Date(Date.now() + mc.ends_in_days * 24 * 60 * 60 * 1000)
      : null;

    const [challenge] = await db
      .insert(challenges)
      .values({
        creator_id: creator.id,
        slug: mc.slug,
        title: mc.title,
        description: mc.description,
        type: mc.type,
        category: mc.category,
        verification_methods: mc.verification_methods,
        nostr_hashtag: mc.nostr_hashtag ?? null,
        checkpoint_mode: mc.checkpoint_mode,
        goal: mc.goal ?? null,
        unit: mc.unit ?? null,
        prize_amount_sats: mc.prize_amount_sats ?? 0,
        prize_distribution: mc.prize_distribution ?? null,
        badge_name: mc.badge_name ?? null,
        status: "open",
        starts_at: new Date(),
        ends_at: endsAt,
      })
      .returning();

    if (mc.checkpoints && mc.checkpoints.length > 0) {
      await db.insert(challenge_checkpoints).values(
        mc.checkpoints.map((cp, idx) => ({
          challenge_id: challenge.id,
          order: idx + 1,
          title: cp.title,
          description: cp.description,
          verification_methods: mc.verification_methods,
        })),
      );
    }

    if (mc.participants.length > 0) {
      await db.insert(participants).values(
        mc.participants.map((p) => {
          const user = userByUsername.get(p.username);
          if (!user) throw new Error(`Missing participant user ${p.username}`);
          return {
            challenge_id: challenge.id,
            user_id: user.id,
            progress: p.progress,
            points: p.points,
            status: p.status ?? "active",
            completed_at: p.status === "completed" ? new Date() : null,
          };
        }),
      );
    }
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
