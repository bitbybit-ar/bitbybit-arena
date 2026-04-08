"use client";

import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Block } from "@/components/common/Block";
import { GithubIcon, MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import styles from "./footer.module.scss";

export function Footer() {
  const t = useTranslations("landing.footer");
  const { theme, toggleTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLocale = () => {
    const newLocale = locale === "es" ? "en" : "es";
    const pathWithoutLocale = pathname.replace(/^\/(es|en)/, "");
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

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
            <div className={styles.toggleGroup}>
              <button
                className={styles.toggle}
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
              </button>
              <button
                className={styles.toggle}
                onClick={toggleLocale}
                aria-label={locale === "es" ? "Switch to English" : "Cambiar a Espanol"}
              >
                {locale === "es" ? "EN" : "ES"}
              </button>
            </div>
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
