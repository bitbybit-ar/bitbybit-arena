"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Block } from "@/components/common/Block";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import { FlagIcon, TrophyIcon, BoltIcon } from "@/components/icons";
import styles from "./projects.module.scss";

const rows = [
  "hackathon",
  "theme",
  "auth",
  "users",
  "rewards",
  "data",
  "status",
  "link",
] as const;

export function Projects() {
  const t = useTranslations("about.projects");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <FlagIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="gold" className={styles.floatBlock2}>
        <TrophyIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="green" className={styles.floatBlock3}>
        <BoltIcon size={22} color="white" />
      </Block>

      <div className={cn(styles.container, "scroll-reveal")} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>

        <div className={styles.table}>
          <div className={cn(styles.row, styles.header)}>
            <div className={styles.label} />
            <div className={cn(styles.cell, styles.gold)}>{t("habitsName")}</div>
            <div className={cn(styles.cell, styles.purple)}>{t("arenaName")}</div>
          </div>
          {rows.map((row) => (
            <div key={row} className={styles.row}>
              <div className={styles.label}>{t(row)}</div>
              <div className={styles.cell}>
                {row === "link" ? (
                  <a
                    href="https://bitbybit.com.ar"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    {t(`habitsLink`)}
                  </a>
                ) : (
                  t(`habits${row.charAt(0).toUpperCase() + row.slice(1)}` as `habits${string}`)
                )}
              </div>
              <div className={styles.cell}>
                {t(`arena${row.charAt(0).toUpperCase() + row.slice(1)}` as `arena${string}`)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.dissolveWrapper}>
        <PixelDissolve />
      </div>
    </section>
  );
}
