"use client";

import { useTranslations } from "next-intl";
import { Block } from "@/components/common/Block";
import { GithubIcon, MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import styles from "./footer.module.scss";

export function Footer() {
  const t = useTranslations("landing.footer");
  const { theme, toggleTheme } = useTheme();

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
            <span className={styles.brandText}>BitByBit Challenges</span>
          </div>

          <div className={styles.links}>
            <a
              href="https://github.com/bitbybit-ar/bitbybit-challenges"
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
            <button
              className={styles.themeToggle}
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
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
          <p className={styles.motto}>{t("motto")}</p>
        </div>
      </div>
    </footer>
  );
}
