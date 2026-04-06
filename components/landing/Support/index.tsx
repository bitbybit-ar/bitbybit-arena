"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Bubble } from "@/components/common/Bubble";
import { Block } from "@/components/common/Block";
import { BoltIcon, GithubIcon, CopyIcon } from "@/components/icons";
import styles from "./support.module.scss";

const LIGHTNING_ADDRESS = "bitbybit@getalby.com";

export function Support() {
  const t = useTranslations("landing.support");
  const ref = useScrollReveal<HTMLElement>();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(LIGHTNING_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.section} ref={ref}>
      <Bubble size={80} color="gold" variant="icon" icon={<BoltIcon />} position={{ top: "10%", left: "5%" }} animation="float-slow" delay={0.5} />
      <Bubble size={44} color="red" position={{ bottom: "15%", right: "8%" }} animation="drift" delay={1.2} />

      <div className={`${styles.container} scroll-reveal`}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={`${styles.cardBorder} ${styles.gold}`} />
            <div className={styles.cardIcon}>
              <Block size="medium" color="gold">
                <BoltIcon size={22} color="white" />
              </Block>
            </div>
            <h3 className={styles.cardTitle}>{t("donateSats")}</h3>
            <p className={styles.cardDescription}>{t("donateDescription")}</p>

            <div className={styles.lightningAddress}>
              <code className={styles.address}>{LIGHTNING_ADDRESS}</code>
              <button
                className={styles.copyButton}
                onClick={handleCopy}
                aria-label="Copy Lightning address"
              >
                <CopyIcon size={16} />
                {copied ? t("copied") : ""}
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={`${styles.cardBorder} ${styles.purple}`} />
            <div className={styles.cardIcon}>
              <Block size="medium" color="purple">
                <GithubIcon size={22} color="white" />
              </Block>
            </div>
            <h3 className={styles.cardTitle}>{t("contribute")}</h3>
            <p className={styles.cardDescription}>
              {t("contributeDescription")}
            </p>

            <a
              href="https://github.com/bitbybit-ar/bitbybit-challenges"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubButton}
            >
              <GithubIcon size={16} />
              {t("starOnGithub")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

