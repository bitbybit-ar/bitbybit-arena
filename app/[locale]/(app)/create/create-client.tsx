"use client";

import { useTranslations } from "next-intl";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Button } from "@/components/ui/button";
import { CreateChallengeForm } from "@/components/challenges/CreateChallengeForm";
import styles from "./create.module.scss";

export function CreateClient() {
  const t = useTranslations("createChallenge");
  const tCommon = useTranslations("common");

  return (
    <div className={styles.page}>
      <CreateChallengeForm
        renderHeader={({ loading }) => (
          <AppPageHeader
            title={t("title")}
            backHref="/explore"
            backLabel={tCommon("back")}
            sticky
            actions={
              <Button type="submit" size="sm" disabled={loading} aria-busy={loading || undefined}>
                {loading ? t("creating") : tCommon("save")}
              </Button>
            }
          />
        )}
      />
    </div>
  );
}
