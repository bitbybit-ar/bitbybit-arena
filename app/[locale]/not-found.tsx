import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { Block } from "@/components/common/Block";
import { Bubble } from "@/components/common/Bubble";
import { Button } from "@/components/ui/button";
import { BoltIcon, FlagIcon, KeyIcon } from "@/components/icons";
import styles from "./not-found.module.scss";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  const session = await getSession();
  const ctaHref = session ? "/explore" : "/";
  const ctaLabel = session ? t("ctaExplore") : t("ctaHome");

  return (
    <div className={styles.page}>
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="small" color="gold" className={styles.floatBlock2}>
        <KeyIcon size={16} color="white" />
      </Block>
      <Block size="medium" color="red" className={styles.floatBlock3}>
        <FlagIcon size={22} color="white" />
      </Block>
      <Bubble
        size={140}
        color="purple"
        opacity={0.2}
        position={{ top: "10%", left: "8%" }}
        animation="float-slow"
      />
      <Bubble
        size={90}
        color="gold"
        opacity={0.2}
        position={{ bottom: "12%", right: "10%" }}
        animation="drift"
        delay={1}
      />

      <div className={styles.card}>
        <p className={styles.code}>{t("code")}</p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>
        <Button href={ctaHref} variant="primary" size="lg" className={styles.cta}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
