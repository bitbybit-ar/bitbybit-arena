"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";
import { Bubble } from "@/components/common/Bubble";
import { GithubIcon, BoltIcon } from "@/components/icons";
import styles from "./team.module.scss";

interface TeamMember {
  key: string;
  github: string;
  nostr?: string;
  color: "purple" | "gold" | "green" | "red";
}

const members: TeamMember[] = [
  { key: "anix", github: "analiaacosta2023", nostr: "", color: "purple" },
  { key: "llopo", github: "LlopoNern", nostr: "", color: "gold" },
  { key: "wander", github: "WanderSady", nostr: "", color: "green" },
  { key: "leon", github: "leodev-xyz", nostr: "", color: "red" },
];

export function Team() {
  const t = useTranslations("about.team");
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className={styles.section}>
      <Bubble size={55} color="purple" variant="solid" opacity={0.2} position={{ top: "12%", right: "6%" }} animation="float-slow" delay={0.5} />
      <Bubble size={40} color="gold" variant="solid" opacity={0.2} position={{ bottom: "15%", right: "10%" }} animation="drift" delay={2} />

      <div className={`${styles.container} scroll-reveal`} ref={ref}>
        <h2 className={styles.title}>{t("title")}</h2>

        <div className={styles.grid}>
          {members.map((member) => (
            <div key={member.key} className={styles.card}>
              <div className={`${styles.cardBorder} ${styles[member.color]}`} />
              <Image
                src={`https://github.com/${member.github}.png`}
                alt={t(`${member.key}.name` as `anix.name`)}
                width={72}
                height={72}
                className={styles.avatar}
              />
              <h3 className={styles.name}>{t(`${member.key}.name` as `anix.name`)}</h3>
              <span className={`${styles.role} ${styles[`role-${member.color}`]}`}>
                {t(`${member.key}.role` as `anix.role`)}
              </span>
              <p className={styles.bio}>{t(`${member.key}.bio` as `anix.bio`)}</p>
              <div className={styles.links}>
                <a
                  href={`https://github.com/${member.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.iconLink}
                  aria-label={`${t(`${member.key}.name` as `anix.name`)} GitHub`}
                >
                  <GithubIcon size={18} />
                </a>
                {member.nostr && (
                  <a
                    href={member.nostr}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.iconLink}
                    aria-label={`${t(`${member.key}.name` as `anix.name`)} Nostr`}
                  >
                    <BoltIcon size={18} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
