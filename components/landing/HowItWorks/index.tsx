"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Block } from "@/components/common/Block";
import { PixelIcon } from "@/components/common/PixelIcon";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import styles from "./how-it-works.module.scss";

const STEPS = [
  { color: "purple" as const, pixelShape: "flag" as const },
  { color: "green" as const, pixelShape: "shield" as const },
  { color: "gold" as const, pixelShape: "trophy" as const },
];

export function HowItWorks() {
  const t = useTranslations("landing.howItWorks");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      {/* Decorative blocks — all animated */}
      <Block size="small" color="purple" className={styles.floatBlock1} />
      <Block size="tiny" color="gold" className={styles.floatBlock2} />
      <Block size="small" color="green" className={styles.floatBlock3} />
      <Block size="tiny" color="red" className={styles.floatBlock4} />
      <Block size="small" color="gold" className={styles.floatBlock5} />
      <Block size="tiny" color="purple" className={styles.floatBlock6} />

      <div className={cn(styles.container, "scroll-reveal-stagger")} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.steps}>
          {STEPS.map((step, i) => {
            const num = i + 1;
            return (
              <div key={i} className={styles.step}>
                <div className={styles.card}>
                  <div className={cn(styles.numberBadge, styles[step.color])}>
                    <span>{num}</span>
                  </div>
                  <div className={styles.pixelIcon}>
                    <PixelIcon shape={step.pixelShape} blockSize={8} />
                  </div>
                  <h3 className={styles.stepTitle}>
                    {t(`step${num}Title` as "step1Title")}
                  </h3>
                  <p className={styles.stepDescription}>
                    {t(`step${num}Description` as "step1Description")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.dissolveWrapper}>
        <PixelDissolve />
      </div>
    </section>
  );
}
