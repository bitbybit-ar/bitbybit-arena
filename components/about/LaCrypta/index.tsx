"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Block } from "@/components/common/Block";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import { ExternalLinkIcon, BoltIcon } from "@/components/icons";
import styles from "./lacrypta.module.scss";

export function LaCrypta() {
  const t = useTranslations("about.lacrypta");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Block size="medium" color="gold" className={styles.floatBlock1}>
        <BoltIcon size={22} color="white" />
      </Block>

      <div className={cn(styles.container, "scroll-reveal")} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>

        <div className={styles.card}>
          <Image
            src="https://github.com/lacrypta.png?size=64"
            alt="La Crypta"
            width={64}
            height={64}
            className={styles.logo}
          />
          <p className={styles.description}>{t("description")}</p>
          <a
            href="https://hackaton.lacrypta.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("visitSite")}
            <ExternalLinkIcon size={14} />
          </a>
        </div>
      </div>

      <div className={styles.dissolveWrapper}>
        <PixelDissolve />
      </div>
    </section>
  );
}
