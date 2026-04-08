"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Block } from "@/components/common/Block";
import { Bubble } from "@/components/common/Bubble";
import { FlagIcon, CameraIcon, BoltIcon, CheckIcon } from "@/components/icons";
import styles from "./how-it-works.module.scss";

const STEPS = [
  { color: "purple" as const, icon: FlagIcon },
  { color: "green" as const, icon: CameraIcon },
  { color: "gold" as const, icon: BoltIcon },
];

export function HowItWorks() {
  const t = useTranslations("landing.howItWorks");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Bubble size={60} color="green" variant="icon" icon={<CheckIcon />} position={{ top: "10%", right: "5%" }} animation="float" delay={0.5} />
      <Bubble size={40} color="purple" position={{ bottom: "15%", left: "3%" }} animation="drift" delay={1.2} />

      <div className={`${styles.container} scroll-reveal-stagger`} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>

        <div className={styles.steps}>
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const num = i + 1;
            return (
              <div key={i} className={styles.step}>
                <div className={`${styles.numberBadge} ${styles[step.color]}`}>
                  <span>{num}</span>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardIcon}>
                    <Block size="medium" color={step.color}>
                      <StepIcon size={22} color="white" />
                    </Block>
                  </div>
                  <h3 className={styles.stepTitle}>
                    {t(`step${num}Title` as "step1Title")}
                  </h3>
                  <p className={styles.stepDescription}>
                    {t(`step${num}Description` as "step1Description")}
                  </p>
                </div>

                {/* Connecting blocks between steps */}
                {i < STEPS.length - 1 && (
                  <div className={styles.connector}>
                    <Block size="tiny" color={step.color} />
                    <Block size="tiny" color={STEPS[i + 1].color} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
