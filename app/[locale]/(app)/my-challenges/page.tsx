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
import { CreateChallengeModal } from "@/components/challenges/CreateChallengeModal";
import { useSignerContext } from "@/lib/signer-context";
import styles from "./my-challenges.module.scss";

const TABS_ID = "my-challenges-tabs";
type Tab = "joined" | "created";

interface MyChallengeItem {
  id: string;
  title: string;
  type: string;
  status: string;
  participant_count: number;
  participation?: { progress: number; status: string } | null;
}

export default function MyChallengesPage() {
  const t = useTranslations("myChallenges");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const tExplore = useTranslations("explore");
  const { needsSigner, requestReSignIn } = useSignerContext();
  const [data, setData] = useState<{ created: MyChallengeItem[]; joined: MyChallengeItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("joined");
  const [showCreate, setShowCreate] = useState(false);

  const fetchMyChallenges = useCallback(() => {
    setLoading(true);
    fetch("/api/my-challenges")
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMyChallenges();
  }, [fetchMyChallenges]);

  const handleCreated = () => {
    setShowCreate(false);
    fetchMyChallenges();
  };

  const handleCreateClick = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setShowCreate(true);
  };

  if (loading) return <div className={styles.loadingState}><BlockLoader label={tCommon("loading")} /></div>;

  const items = tab === "created" ? data?.created : data?.joined;

  const tabItems = [
    { value: "joined" as const, label: `${t("joined")} (${data?.joined.length ?? 0})` },
    { value: "created" as const, label: `${t("created")} (${data?.created.length ?? 0})` },
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
        {!items || items.length === 0 ? (
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
