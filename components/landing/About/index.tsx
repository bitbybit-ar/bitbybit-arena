"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Bubble } from "@/components/common/Bubble";
import { Block } from "@/components/common/Block";
import { ExternalLinkIcon } from "@/components/icons";
import styles from "./about.module.scss";

export function About() {
  const t = useTranslations("landing.about");
  const ref = useScrollReveal<HTMLElement>();

  return (
    <section className={styles.section} ref={ref}>
      <Bubble size={70} color="gold" position={{ top: "10%", right: "8%" }} animation="float-slow" delay={0.5} />
      <Bubble size={44} color="purple" position={{ bottom: "20%", left: "5%" }} animation="drift" delay={1} />

      <div className={`${styles.container} scroll-reveal`}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.description}>{t("description")}</p>

        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={`${styles.cardBorder} ${styles.gold}`} />
            <h3 className={styles.cardTitle}>{t("habitsTitle")}</h3>
            <ul className={styles.cardList}>
              <li>{t("habitsPrivate")}</li>
              <li>{t("habitsRoutines")}</li>
              <li>{t("habitsReward")}</li>
            </ul>
            <a
              href="https://bitbybit.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.cardLink}
            >
              {t("habitsLink")}
              <ExternalLinkIcon size={14} />
            </a>
          </div>

          <div className={styles.dividerBlocks}>
            <Block size="small" color="purple" />
            <Block size="small" color="gold" />
            <Block size="small" color="green" />
          </div>

          <div className={`${styles.card} ${styles.active}`}>
            <div className={`${styles.cardBorder} ${styles.purple}`} />
            <h3 className={styles.cardTitle}>{t("challengesTitle")}</h3>
            <ul className={styles.cardList}>
              <li>{t("challengesPublic")}</li>
              <li>{t("challengesCompetitions")}</li>
              <li>{t("challengesReward")}</li>
            </ul>
            <span className={styles.hereBadge}>{t("challengesHere")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
