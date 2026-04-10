"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Block } from "@/components/common/Block";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import { FlagIcon, BoltIcon, TrophyIcon } from "@/components/icons";
import styles from "./partners.module.scss";

const partners = [
  {
    name: "La Crypta",
    url: "https://lacrypta.ar",
    logo: "https://github.com/lacrypta.png?size=64",
    descriptionKey: "laCryptaDescription" as const,
    color: "gold" as const,
  },
  {
    name: "Nostr WoT",
    url: "https://nostr-wot.com/",
    logo: "/images/partners/nostr-wot.webp",
    descriptionKey: "nostrWotDescription" as const,
    color: "purple" as const,
  },
];

export function Partners() {
  const t = useTranslations("landing.partners");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      {/* Floating blocks with icons */}
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <FlagIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="gold" className={styles.floatBlock2}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="green" className={styles.floatBlock3}>
        <TrophyIcon size={22} color="white" />
      </Block>

      <div className={`${styles.container} scroll-reveal`} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.logos}>
          {partners.map((partner) => (
            <a
              key={partner.name}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.partnerLink} ${styles[partner.color]}`}
            >
              <Image
                src={partner.logo}
                alt={partner.name}
                width={64}
                height={64}
                className={styles.partnerLogo}
              />
              <span className={styles.partnerName}>{partner.name}</span>
              <span className={styles.partnerDescription}>
                {t(partner.descriptionKey)}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Bottom pixel dissolve */}
      <div className={styles.dissolveBottom}>
        <PixelDissolve />
      </div>
    </section>
  );
}
