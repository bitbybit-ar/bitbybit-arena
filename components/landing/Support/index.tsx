"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Block } from "@/components/common/Block";
import { BoltIcon, GithubIcon } from "@/components/icons";
import styles from "./support.module.scss";

export function Support() {
  const t = useTranslations("landing.support");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Block size="medium" color="gold" className={styles.floatBlock1}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="purple" className={styles.floatBlock2}>
        <GithubIcon size={22} color="white" />
      </Block>

      <div className={`${styles.container} scroll-reveal`} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.actions}>
          <button className={styles.zapButton}>
            <BoltIcon size={18} color="white" />
            {t("zapDevs")}
          </button>
          <a
            href="https://github.com/bitbybit-ar/bitbybit-arena"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubButton}
          >
            <GithubIcon size={18} />
            {t("starOnGithub")}
          </a>
        </div>
      </div>
    </section>
  );
}
