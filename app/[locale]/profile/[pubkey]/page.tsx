import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { alternatesFor } from "@/lib/seo";
import { ProfileBadgesGrid } from "./ProfileBadgesGrid";
import { ProfileActions } from "./ProfileActions";
import styles from "./profile.module.scss";

const HEX_64_RE = /^[0-9a-f]{64}$/i;

interface PageProps {
  params: Promise<{ locale: string; pubkey: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, pubkey } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  if (!HEX_64_RE.test(pubkey)) return { title: t("title") };
  const db = getDb();
  const [user] = await db
    .select({ display_name: users.display_name })
    .from(users)
    .where(eq(users.nostr_pubkey, pubkey.toLowerCase()))
    .limit(1);
  const title = user?.display_name
    ? t("titleWithName", { name: user.display_name })
    : t("title");
  return {
    title,
    alternates: alternatesFor(locale, `/profile/${pubkey.toLowerCase()}`),
  };
}

// Public profile page indexed by Nostr pubkey. Hex form in the URL so
// shareable links don't depend on whichever bech32 npub the viewer's
// client encodes; we lowercase before lookup since `users.nostr_pubkey`
// is stored lowercase per `Hex64Schema`. Renders the locally-known DB
// fields (display_name, avatar, about, lightning_address) plus a
// client-side grid that queries Nostr relays for kind:8 awards
// p-tagging this pubkey — meaning the badges from Arena AND any other
// app the user has on their identity.
export default async function ProfilePage({ params }: PageProps) {
  const { pubkey: rawPubkey } = await params;
  if (!HEX_64_RE.test(rawPubkey)) notFound();
  const pubkey = rawPubkey.toLowerCase();

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      nostr_pubkey: users.nostr_pubkey,
      display_name: users.display_name,
      username: users.username,
      avatar_url: users.avatar_url,
      about: users.about,
      lightning_address: users.lightning_address,
      deleted_at: users.deleted_at,
    })
    .from(users)
    .where(eq(users.nostr_pubkey, pubkey))
    .limit(1);

  // Soft-deleted accounts surface as 404 — the row is kept for FK
  // integrity but the public page is gone. If the user never signed in
  // to Arena there's no row at all; we still render a thin profile
  // shell driven by their pubkey + any badges visible on relays, so
  // the URL is meaningfully shareable for participants who haven't
  // touched Arena yet.
  if (user?.deleted_at) notFound();

  const t = await getTranslations("profile");
  const njumpUrl = `https://njump.me/${pubkey}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatarWrapper}>
          {user?.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.avatar_url}
              alt={user.display_name ?? t("unknownUser")}
              className={styles.avatar}
              width={128}
              height={128}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={styles.avatarPlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.identity}>
          <h1 className={styles.displayName}>
            {user?.display_name ?? t("unknownUser")}
          </h1>
          {user?.username && (
            <p className={styles.username}>@{user.username}</p>
          )}
          <p className={styles.pubkey} title={pubkey}>
            {pubkey.slice(0, 10)}…{pubkey.slice(-6)}
          </p>
          {user?.about && <p className={styles.about}>{user.about}</p>}
          <ProfileActions
            lightningAddress={user?.lightning_address ?? null}
            njumpUrl={njumpUrl}
          />
        </div>
      </header>

      <section className={styles.badgesSection}>
        <h2 className={styles.sectionTitle}>{t("badgesTitle")}</h2>
        <p className={styles.sectionHint}>{t("badgesHint")}</p>
        <ProfileBadgesGrid pubkey={pubkey} />
      </section>
    </div>
  );
}
