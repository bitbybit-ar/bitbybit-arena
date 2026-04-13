"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { GithubIcon } from "@/components/icons";
import styles from "./opensource.module.scss";

export function OpenSource() {
  const t = useTranslations("about.openSource");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <div className={cn(styles.container, "scroll-reveal")} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.description}>{t("description")}</p>
        <p className={styles.contribute}>{t("contribute")}</p>

        <div className={styles.repos}>
          <a
            href="https://github.com/bitbybit-ar/bitbybit-arena"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
          >
            <GithubIcon size={18} />
            {t("arenaRepo")}
          </a>
          <a
            href="https://github.com/bitbybit-ar/bitbybit-habits"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
          >
            <GithubIcon size={18} />
            {t("habitsRepo")}
          </a>
        </div>
      </div>
    </section>
  );
}
