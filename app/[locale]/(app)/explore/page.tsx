"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { FlagIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useSignerContext } from "@/lib/signer-context";
import { CreateChallengeModal } from "./CreateChallengeModal";
import styles from "./explore.module.scss";

interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  category: string | null;
  participant_count: number;
  ends_at: string | null;
  created_at: string;
  creator: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function ExplorePage() {
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const { needsSigner, requestReSignIn } = useSignerContext();

  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [showCreate, setShowCreate] = useState(false);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    params.set("sort", sort);
    params.set("status", "open");

    try {
      const res = await fetch(`/api/challenges?${params}`);
      const json = await res.json();
      if (json.success) {
        setChallenges(json.data.items);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search, type, sort]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const handleCreated = () => {
    setShowCreate(false);
    fetchChallenges();
  };

  const handleCreateClick = async () => {
    // Anonymous or reattach users: prompt to sign in first so we don't end
    // up stacking CreateChallengeModal on top of ReSignInModal.
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return; // user cancelled
      }
    }
    setShowCreate(true);
  };

  const typeOptions = ["one_time", "streak", "competition", "race", "creative"];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <Button onClick={handleCreateClick} size="sm">
          {t("createNew")}
        </Button>
      </div>

      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{t("allTypes")}</option>
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {tCreate(`types.${opt}`)}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">{t("newest")}</option>
            <option value="ending_soon">{t("endingSoon")}</option>
            <option value="most_participants">{t("mostParticipants")}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <Spinner size="lg" label={tCommon("loading")} />
        </div>
      ) : challenges.length === 0 ? (
        <div className={styles.emptyState}>
          <FlagIcon size={48} />
          <p>{search || type ? t("emptyFiltered") : t("empty")}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {challenges.map((challenge) => (
            <Link
              key={challenge.id}
              href={`/explore/${challenge.id}`}
              className={styles.card}
            >
              <div className={styles.cardHeader}>
                <Tag variant={typeVariant(challenge.type)}>
                  {tCreate(`types.${challenge.type}`)}
                </Tag>
              </div>
              <h3 className={styles.cardTitle}>{challenge.title}</h3>
              <p className={styles.cardDescription}>
                {challenge.description.slice(0, 120)}
                {challenge.description.length > 120 ? "..." : ""}
              </p>
              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>
                  {challenge.participant_count} {tCommon("participants")}
                </span>
                {challenge.ends_at && (
                  <span className={styles.metaItem}>
                    {formatDate(challenge.ends_at)}
                  </span>
                )}
              </div>
              <div className={styles.cardCreator}>
                {challenge.creator.display_name}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateChallengeModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function typeVariant(type: string): "purple" | "gold" | "green" | "red" {
  switch (type) {
    case "streak": return "gold";
    case "competition": return "red";
    case "creative": return "green";
    default: return "purple";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
