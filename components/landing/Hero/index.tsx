"use client";

import { useTranslations } from "next-intl";
import { BlockTower } from "@/components/common/BlockTower";
import { Bubble } from "@/components/common/Bubble";
import { BoltIcon, TrophyIcon } from "@/components/icons";
import styles from "./hero.module.scss";

export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section className={styles.hero}>
      {/* Decorative bubbles */}
      <Bubble size={80} color="purple" position={{ top: "12%", right: "8%" }} animation="float" delay={0} />
      <Bubble size={48} color="gold" position={{ top: "20%", right: "18%" }} animation="drift" delay={1.5} />
      <Bubble size={100} color="green" variant="icon" icon={<TrophyIcon />} position={{ bottom: "20%", right: "5%" }} animation="float-slow" delay={0.8} />
      <Bubble size={60} color="purple" position={{ bottom: "15%", left: "5%" }} animation="drift" delay={2} />
      <Bubble size={36} color="red" position={{ top: "30%", left: "3%" }} animation="float" delay={1} />

      <div className={styles.container}>
        <div className={styles.content}>
          <span className={styles.badge}>
            <BoltIcon size={14} />
            {t("badge")}
          </span>

          <h1 className={styles.headline}>
            <span className={styles.line1}>{t("headline1")}</span>
            <span className={styles.line2}>{t("headline2")}</span>
          </h1>

          <p className={styles.subtitle}>{t("subtitle")}</p>

          <div className={styles.ctas}>
            <button className={styles.ctaPrimary}>{t("exploreCta")}</button>
            <button className={styles.ctaOutline}>{t("createCta")}</button>
          </div>
        </div>

        <div className={styles.visual}>
          <BlockTower maxBlocks={5} blockSize="large" animate />
        </div>
      </div>
    </section>
  );
}
