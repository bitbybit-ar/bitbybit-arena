"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { PixelIcon } from "@/components/common/PixelIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { BlockLoader } from "@/components/ui/block-loader";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CheckpointProgress } from "@/components/challenges/CheckpointProgress";
import { AchievementCard } from "@/components/challenges/AchievementCard";
import type { AchievementItem } from "@/lib/types";
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
import { type ShareContext } from "@/components/share/ShareOnNostrModal";
import styles from "./my-challenges.module.scss";

// Mounted only after the user accepts a badge, so it stays out of the
// page-load bundle.
const ShareOnNostrModal = dynamic(
  () =>
    import("@/components/share/ShareOnNostrModal").then(
      (m) => m.ShareOnNostrModal
    ),
  { ssr: false }
);

const TABS_ID = "my-challenges-tabs";
type Tab = "joined" | "created" | "achievements";

const VALID_TABS: Tab[] = ["joined", "created", "achievements"];

// Read the initial tab from `?tab=` so deep-links from the
// challenge-page awardee banner actually land on Achievements
// instead of dropping the user on the default Joined tab.
function initialTabFromUrl(raw: string | null): Tab {
  if (raw && (VALID_TABS as string[]).includes(raw)) return raw as Tab;
  return "joined";
}

interface MyChallengeItem {
  id: string;
  title: string;
  type: string;
  status: string;
  checkpoint_mode: "none" | "sequential" | "parallel";
  participant_count: number;
  checkpoints_total: number;
  checkpoints_approved: number;
  checkpoints_pending: number;
  participation?: { progress: number; status: string } | null;
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
  const searchParams = useSearchParams();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [createdItems, setCreatedItems] = useState<MyChallengeItem[]>([]);
  const [joinedItems, setJoinedItems] = useState<MyChallengeItem[]>([]);
  const [createdCursor, setCreatedCursor] = useState<string | null>(null);
  const [joinedCursor, setJoinedCursor] = useState<string | null>(null);
  const [loadingMoreCreated, setLoadingMoreCreated] = useState(false);
  const [loadingMoreJoined, setLoadingMoreJoined] = useState(false);
  const [achievements, setAchievements] = useState<AchievementItem[] | null>(null);
  const [achievementsCursor, setAchievementsCursor] = useState<string | null>(null);
  const [loadingMoreAchievements, setLoadingMoreAchievements] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() =>
    initialTabFromUrl(searchParams?.get("tab") ?? null)
  );
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/my-challenges").then((r) => r.json()),
      fetch("/api/my-badges").then((r) => r.json()),
    ])
      .then(([challengesJson, badgesJson]) => {
        if (challengesJson.success) {
          setCreatedItems(challengesJson.data.created.items);
          setCreatedCursor(challengesJson.data.created.nextCursor);
          setJoinedItems(challengesJson.data.joined.items);
          setJoinedCursor(challengesJson.data.joined.nextCursor);
        }
        if (badgesJson.success) {
          setAchievements(badgesJson.data.items);
          setAchievementsCursor(badgesJson.data.nextCursor);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMoreCreated = useCallback(async () => {
    if (!createdCursor || loadingMoreCreated) return;
    setLoadingMoreCreated(true);
    try {
      const res = await fetch(
        `/api/my-challenges?scope=created&cursor=${encodeURIComponent(createdCursor)}`
      );
      const json = await res.json();
      if (json.success) {
        setCreatedItems((prev) => [...prev, ...json.data.created.items]);
        setCreatedCursor(json.data.created.nextCursor);
      }
    } catch {
      /* ignore — user can retry */
    } finally {
      setLoadingMoreCreated(false);
    }
  }, [createdCursor, loadingMoreCreated]);

  const loadMoreJoined = useCallback(async () => {
    if (!joinedCursor || loadingMoreJoined) return;
    setLoadingMoreJoined(true);
    try {
      const res = await fetch(
        `/api/my-challenges?scope=joined&cursor=${encodeURIComponent(joinedCursor)}`
      );
      const json = await res.json();
      if (json.success) {
        setJoinedItems((prev) => [...prev, ...json.data.joined.items]);
        setJoinedCursor(json.data.joined.nextCursor);
      }
    } catch {
      /* ignore — user can retry */
    } finally {
      setLoadingMoreJoined(false);
    }
  }, [joinedCursor, loadingMoreJoined]);

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

  const items =
    tab === "created"
      ? createdItems
      : tab === "joined"
        ? joinedItems
        : undefined;
  const showAchievements = tab === "achievements";
  const badgeCount = achievements?.length ?? 0;

  // "20+" when the server says there's another page — we can't show
  // a true total without a COUNT(*) round-trip and the number is only
  // used on a tab label.
  const joinedLabelCount = `${joinedItems.length}${joinedCursor ? "+" : ""}`;
  const createdLabelCount = `${createdItems.length}${createdCursor ? "+" : ""}`;

  const tabItems = [
    { value: "joined" as const, label: `${t("joined")} (${joinedLabelCount})` },
    { value: "created" as const, label: `${t("created")} (${createdLabelCount})` },
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
            <EmptyState
              icon={<PixelIcon shape="flag" blockSize={8} />}
              title={t("emptyAchievements")}
              description={t("emptyAchievementsBody")}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => router.push("/explore")}
                >
                  {t("emptyAchievementsCta")}
                </Button>
              }
            />
          ) : (
            <>
            <div className={styles.achievementGrid}>
              {achievements.map((badge) => (
                <AchievementCard
                  key={badge.id}
                  achievement={badge}
                  onAccept={handleAcceptBadge}
                  accepting={accepting !== null}
                  acceptingThis={accepting === badge.id}
                />
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
          <EmptyState
            icon={<PixelIcon shape="flag" blockSize={8} />}
            title={tab === "created" ? t("emptyCreated") : t("emptyJoined")}
            description={
              tab === "created" ? t("emptyCreatedBody") : t("emptyJoinedBody")
            }
            action={
              tab === "created" ? (
                <Button size="sm" onClick={handleCreateClick}>
                  {tExplore("createNew")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => router.push("/explore")}
                >
                  {t("emptyJoinedCta")}
                </Button>
              )
            }
          />
        ) : (
          <div className={styles.list}>
            {items.map((item) => {
              const total = item.checkpoints_total;
              const hasCheckpoints =
                tab === "joined" &&
                item.checkpoint_mode !== "none" &&
                total > 0;
              const approved = item.checkpoints_approved;
              const pending = item.checkpoints_pending;
              return (
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
                  {hasCheckpoints && (
                    <div className={styles.progressRow}>
                      <CheckpointProgress
                        approved={approved}
                        pending={pending}
                        total={total}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
            {tab === "joined" && joinedCursor && (
              <div className={styles.loadMoreRow}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadMoreJoined}
                  disabled={loadingMoreJoined}
                >
                  {loadingMoreJoined ? tCommon("loading") : t("loadMore")}
                </Button>
              </div>
            )}
            {tab === "created" && createdCursor && (
              <div className={styles.loadMoreRow}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadMoreCreated}
                  disabled={loadingMoreCreated}
                >
                  {loadingMoreCreated ? tCommon("loading") : t("loadMore")}
                </Button>
              </div>
            )}
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
