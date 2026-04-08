"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Bubble } from "@/components/common/Bubble";
import { HandshakeIcon } from "@/components/icons";
import styles from "./partners.module.scss";

const partners = [
  {
    name: "La Crypta",
    url: "https://lacrypta.ar",
    logo: "https://github.com/lacrypta.png?size=64",
  },
  {
    name: "OpenClaw",
    url: "https://openclaw.com",
    logo: "https://github.com/openclaw.png?size=64",
  },
  {
    name: "Bitcoin",
    url: "https://bitcoin.org",
    logo: "https://github.com/bitcoin.png?size=64",
  },
];

export function Partners() {
  const t = useTranslations("landing.partners");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Bubble size={50} color="purple" variant="icon" icon={<HandshakeIcon />} position={{ top: "15%", right: "10%" }} animation="float" delay={0.3} />

      <div className={`${styles.container} scroll-reveal`} ref={ref}>
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
              <Image
                src={partner.logo}
                alt={partner.name}
                width={64}
                height={64}
                className={styles.partnerLogo}
              />
              <span className={styles.partnerName}>{partner.name}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
