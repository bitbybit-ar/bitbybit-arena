"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Block } from "@/components/common/Block";
import { GithubIcon } from "@/components/icons";
import styles from "./footer.module.scss";

export function Footer() {
  const t = useTranslations("landing.footer");

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <div className={styles.logoBlocks}>
              <Block size="tiny" color="purple" />
              <Block size="tiny" color="gold" />
              <Block size="tiny" color="green" />
            </div>
            <span className={styles.brandText}>BitByBit Arena</span>
          </div>

          <div className={styles.links}>
            <Link href="/about" className={styles.link}>
              {t("aboutUs")}
            </Link>
            <a
              href="https://github.com/bitbybit-ar"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              <GithubIcon size={16} />
              {t("github")}
            </a>
            <a
              href="https://bitbybit.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {t("habits")}
            </a>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.built}>
            {t("builtFor")}{" "}
            <a
              href="https://hackaton.lacrypta.ar"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.hackathonLink}
            >
              {t("hackathonName")}
            </a>
          </p>
          <div className={styles.mottoRow}>
            <a
              href="https://lacrypta.ar"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.cryptaLink}
            >
              <Image
                src="https://github.com/lacrypta.png?size=64"
                alt="La Crypta"
                width={64}
                height={64}
                className={styles.cryptaLogo}
              />
            </a>
            <p className={styles.motto}>{t("motto")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
