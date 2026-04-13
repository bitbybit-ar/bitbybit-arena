"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Bubble } from "@/components/common/Bubble";
import { BlockTower } from "@/components/common/BlockTower";
import { BoltIcon, HeartIcon } from "@/components/icons";
import styles from "./story.module.scss";

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function Story() {
  const t = useTranslations("about.story");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Bubble size={65} color="gold" variant="icon" icon={<BoltIcon />} opacity={0.3} position={{ top: "10%", left: "4%" }} animation="float" delay={0} />
      <Bubble size={50} color="green" variant="icon" icon={<HeartIcon />} opacity={0.25} position={{ bottom: "20%", left: "8%" }} animation="drift" delay={1.2} />

      <div className={cn(styles.container, "scroll-reveal")} ref={ref}>
        <div className={styles.content}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.paragraph}>{renderBold(t("p1"))}</p>
          <p className={styles.paragraph}>{renderBold(t("p2"))}</p>
          <p className={styles.paragraph}>{renderBold(t("p3"))}</p>
          <p className={styles.paragraph}>{renderBold(t("p4"))}</p>
        </div>
        <div className={styles.tower}>
          <BlockTower maxBlocks={5} blockSize="medium" animate />
        </div>
      </div>
    </section>
  );
}
