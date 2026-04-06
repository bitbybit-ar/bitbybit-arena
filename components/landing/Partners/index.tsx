"use client";

import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Bubble } from "@/components/common/Bubble";
import { HandshakeIcon } from "@/components/icons";
import styles from "./partners.module.scss";

const partners = [
  {
    name: "La Crypta",
    url: "https://lacrypta.ar",
    logo: "https://github.com/lacrypta.png",
  },
  {
    name: "Nostr WoT",
    url: "https://github.com/nicbus/wot-relay",
    logo: "https://github.com/nicbus.png",
  },
];

export function Partners() {
  const t = useTranslations("landing.partners");
  const ref = useScrollReveal<HTMLElement>();

  return (
    <section className={styles.section} ref={ref}>
      <Bubble size={50} color="purple" variant="icon" icon={<HandshakeIcon />} position={{ top: "15%", right: "10%" }} animation="float" delay={0.3} />

      <div className={`${styles.container} scroll-reveal`}>
        <h2 className={styles.title}>{t("title")}</h2>

        <div className={styles.logos}>
          {partners.map((partner) => (
            <a
              key={partner.name}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.partnerLink}
            >
              <img
                src={partner.logo}
                alt={partner.name}
                className={styles.partnerLogo}
                width={48}
                height={48}
              />
              <span className={styles.partnerName}>{partner.name}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
