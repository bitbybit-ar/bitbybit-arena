"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PixelIcon } from "@/components/common/PixelIcon";
import { BlockLoader } from "@/components/ui/block-loader";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Tabs, panelIdFor } from "@/components/ui/tabs";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { useRouter } from "@/i18n/routing";
import { useSignerContext } from "@/lib/signer-context";
import { fetchLatestEventOfKind } from "@/lib/nostr/metadata";
import {
  buildProfileBadgesEvent,
  parseProfileBadgesPairs,
} from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { useToast } from "@/components/ui/toast";
import {
  ShareOnNostrModal,
  type ShareContext,
} from "@/components/share/ShareOnNostrModal";
import styles from "./my-challenges.module.scss";

const TABS_ID = "my-challenges-tabs";
type Tab = "joined" | "created" | "achievements";

interface MyChallengeItem {
  id: string;
  title: string;
  type: string;
  status: string;
  participant_count: number;
  participation?: { progress: number; status: string } | null;
}

interface AchievementItem {
  id: string;
  badge_name: string;
  badge_image_url: string | null;
  nostr_event_id: string | null;
  awarded_at: string;
  accepted_at: string | null;
  challenge: {
    id: string;
    slug: string;
    title: string;
    badge_nostr_event_id: string | null;
  };
  issuer: {
    id: string;
    display_name: string;
    username: string;
    nostr_pubkey: string;
  };
}

export default function MyChallengesPage() {
  const t = useTranslations("myChallenges");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const tExplore = useTranslations("explore");
  const {
    needsSigner,
    requestReSignIn,
    signWithPrompt,
    session,
  } = useSignerContext();
  const { showToast } = useToast();
  const router = useRouter();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [data, setData] = useState<{ created: MyChallengeItem[]; joined: MyChallengeItem[] } | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[] | null>(null);
  const [achievementsCursor, setAchievementsCursor] = useState<string | null>(null);
  const [loadingMoreAchievements, setLoadingMoreAchievements] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("joined");
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/my-challenges").then((r) => r.json()),
      fetch("/api/my-badges").then((r) => r.json()),
    ])
      .then(([challengesJson, badgesJson]) => {
        if (challengesJson.success) setData(challengesJson.data);
        if (badgesJson.success) {
          setAchievements(badgesJson.data.items);
          setAchievementsCursor(badgesJson.data.nextCursor);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMoreAchievements = useCallback(async () => {
    if (!achievementsCursor || loadingMoreAchievements) return;
    setLoadingMoreAchievements(true);
    try {
      const res = await fetch(
        `/api/my-badges?cursor=${encodeURIComponent(achievementsCursor)}`
      );
      const json = await res.json();
      if (json.success) {
        setAchievements((prev) => [...(prev ?? []), ...json.data.items]);
        setAchievementsCursor(json.data.nextCursor);
      }
    } catch {
      /* ignore — user can retry */
    } finally {
      setLoadingMoreAchievements(false);
    }
  }, [achievementsCursor, loadingMoreAchievements]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreateClick = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    router.push("/create");
  };

  const handleAcceptBadge = async (badge: AchievementItem) => {
    if (!badge.challenge.badge_nostr_event_id || !badge.nostr_event_id) {
      // Missing either the kind:30009 definition event id or the kind:8
      // award event id — this badge was earned before Phase A landed (or
      // the publish step failed). We can't build a valid 30008 pair
      // without both, so bail early with a clear message.
      showToast(t("acceptMissingIds"), "error");
      return;
    }
    if (!session?.nostr_pubkey) {
      showToast(t("acceptMissingSession"), "error");
      return;
    }
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }

    setAccepting(badge.id);
    try {
      const definitionATag = `30009:${badge.issuer.nostr_pubkey}:${badge.challenge.slug}`;
      const newPair = {
        definitionATag,
        awardEventId: badge.nostr_event_id,
      };

      // Preserve any previously accepted badges by fetching the user's
      // latest kind:30008 and merging. If relays don't have one yet, we
      // publish a fresh event with just this pair.
      const latest = await fetchLatestEventOfKind(
        session.nostr_pubkey,
        30008
      ).catch(() => null);
      const existing = latest ? parseProfileBadgesPairs(latest) : [];
      const deduped = existing.filter(
        (p) => p.awardEventId !== newPair.awardEventId
      );
      const merged = [...deduped, newPair];

      const event = buildProfileBadgesEvent(merged);
      const signed = await signWithPrompt(event);
      await publishSignedEvent(signed);

      const patchRes = await fetch(`/api/badges/${badge.id}`, {
        method: "PATCH",
      });
      const patchJson = await patchRes.json().catch(() => null);
      if (!patchRes.ok || !patchJson?.success) {
        // The relay publish succeeded but we couldn't persist the
        // accepted_at flag on our own DB row. Surface the failure so
        // the user knows the UI state and the server state disagree.
        showToast(t("acceptFailed"), "error");
        return;
      }

      showToast(t("acceptSuccess"), "success");
      // Mutate the single badge in local state instead of refetching —
      // this preserves the current "Load more" scroll depth and avoids
      // yanking the user back to the first page of achievements.
      setAchievements((prev) =>
        prev
          ? prev.map((b) =>
              b.id === badge.id
                ? { ...b, accepted_at: new Date().toISOString() }
                : b
            )
          : prev
      );
      setShareContext({
        kind: "badge-received",
        challenge: {
          id: badge.challenge.id,
          title: badge.challenge.title,
        },
        badgeName: badge.badge_name,
      });
    } catch {
      showToast(t("acceptFailed"), "error");
    } finally {
      setAccepting(null);
    }
  };

  if (loading) return <div className={styles.loadingState}><BlockLoader label={tCommon("loading")} /></div>;

  const items = tab === "created" ? data?.created : tab === "joined" ? data?.joined : undefined;
  const showAchievements = tab === "achievements";
  const badgeCount = achievements?.length ?? 0;

  const tabItems = [
    { value: "joined" as const, label: `${t("joined")} (${data?.joined.length ?? 0})` },
    { value: "created" as const, label: `${t("created")} (${data?.created.length ?? 0})` },
    { value: "achievements" as const, label: `${t("achievements")} (${badgeCount})` },
  ];

  return (
    <div className={styles.page}>
      <AppPageHeader
        title={t("title")}
        backHref="/explore"
        backLabel={tCommon("back")}
        actions={
          <Button onClick={handleCreateClick} size="sm">
            {tExplore("createNew")}
          </Button>
        }
      />
      <Tabs
        id={TABS_ID}
        tabs={tabItems}
        value={tab}
        onChange={setTab}
        ariaLabel={t("title")}
      />
      <div {...{ id: panelIdFor(TABS_ID, tab), role: "tabpanel" as const, "aria-labelledby": `${TABS_ID}-tab-${tab}` }}>
        {showAchievements ? (
          !achievements || achievements.length === 0 ? (
            <div className={styles.emptyState}>
              <PixelIcon shape="flag" blockSize={8} />
              <p>{t("emptyAchievements")}</p>
            </div>
          ) : (
            <>
            <div className={styles.achievementGrid}>
              {achievements.map((badge) => (
                <div key={badge.id} className={styles.achievementCard}>
                  <Link
                    href={`/explore/${badge.challenge.id}`}
                    className={styles.achievementLink}
                  >
                    <div className={styles.achievementImageWrapper}>
                      {badge.badge_image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={badge.badge_image_url}
                          alt={badge.badge_name}
                          className={styles.achievementImage}
                        />
                      ) : (
                        <div className={styles.achievementImagePlaceholder}>
                          <PixelIcon shape="sword" blockSize={8} />
                        </div>
                      )}
                    </div>
                    <div className={styles.achievementBody}>
                      <h3 className={styles.achievementName}>
                        {badge.badge_name}
                      </h3>
                      <p className={styles.achievementChallenge}>
                        {badge.challenge.title}
                      </p>
                      <p className={styles.achievementDate}>
                        {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                  {badge.accepted_at ? (
                    <span className={styles.acceptedPill}>
                      {t("acceptedOnNostr")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAcceptBadge(badge)}
                      // Disable all accept buttons while any one is in
                      // flight: concurrent accepts race on the latest
                      // kind:30008 and can drop previously-merged pairs
                      // because neither publish has hit relays yet.
                      disabled={accepting !== null}
                    >
                      {accepting === badge.id ? t("accepting") : t("acceptBadge")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {achievementsCursor && (
              <div className={styles.loadMoreRow}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadMoreAchievements}
                  disabled={loadingMoreAchievements}
                >
                  {loadingMoreAchievements
                    ? tCommon("loading")
                    : t("loadMore")}
                </Button>
              </div>
            )}
            </>
          )
        ) : !items || items.length === 0 ? (
          <div className={styles.emptyState}>
            <PixelIcon shape="flag" blockSize={8} />
            <p>{tab === "created" ? t("emptyCreated") : t("emptyJoined")}</p>
          </div>
        ) : (
          <div className={styles.list}>
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/explore/${item.id}`}
                className={styles.card}
              >
                <div className={styles.cardTop}>
                  <Tag variant={typeVariant(item.type)}>{tCreate(`types.${item.type}`)}</Tag>
                  <Tag variant={statusVariant(item.status)}>{tCommon(statusKey(item.status))}</Tag>
                </div>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <div className={styles.cardMeta}>
                  <span>{item.participant_count} {tCommon("participants")}</span>
                  {item.participation?.status === "completed" && <span className={styles.completed}>{tCommon("completed")}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {shareContext && (
        <ShareOnNostrModal
          context={shareContext}
          onClose={() => setShareContext(null)}
        />
      )}
    </div>
  );
}

function typeVariant(type: string): "purple" | "gold" | "green" | "red" {
  const map: Record<string, "purple" | "gold" | "green" | "red"> = { streak: "gold", competition: "red", creative: "green" };
  return map[type] || "purple";
}
function statusVariant(status: string): "purple" | "gold" | "green" | "red" {
  const map: Record<string, "purple" | "gold" | "green" | "red"> = { open: "green", in_progress: "gold", completed: "purple", cancelled: "red" };
  return map[status] || "purple";
}
function statusKey(status: string): string {
  return status === "in_progress" ? "inProgress" : status;
}
