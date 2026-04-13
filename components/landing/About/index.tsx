"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Bubble } from "@/components/common/Bubble";
import { Block } from "@/components/common/Block";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import { ExternalLinkIcon, BoltIcon, HeartIcon, TrophyIcon, FlagIcon, BadgeIcon } from "@/components/icons";
import styles from "./about.module.scss";

export function About() {
  const t = useTranslations("landing.about");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      {/* Bubbles — Habits identity (organic, round, playful, with icons) */}
      <Bubble size={70} color="gold" variant="icon" icon={<BoltIcon />} opacity={0.35} position={{ top: "8%", left: "3%" }} animation="float" delay={0} />
      <Bubble size={50} color="green" variant="icon" icon={<HeartIcon />} opacity={0.3} position={{ top: "25%", left: "12%" }} animation="drift" delay={1.5} />
      <Bubble size={56} color="gold" variant="icon" icon={<TrophyIcon />} opacity={0.35} position={{ bottom: "18%", left: "6%" }} animation="float-slow" delay={0.8} />

      {/* Blocks — Arena identity (geometric, sharp, competitive, with icons) */}
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <FlagIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="red" className={styles.floatBlock2}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="green" className={styles.floatBlock3}>
        <BadgeIcon size={22} color="white" />
      </Block>

      <div className={cn(styles.container, "scroll-reveal")} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.description}>{t("description")}</p>

        <div className={styles.cards}>
          <div className={styles.card}>
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

          <div className={cn(styles.card, styles.active)}>
            <div className={styles.arenaGlow} />
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

      <div className={styles.dissolveWrapper}>
        <PixelDissolve />
      </div>
    </section>
  );
}
