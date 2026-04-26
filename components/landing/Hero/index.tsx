"use client";

import { useTranslations } from "next-intl";
import { Block } from "@/components/common/Block";
import { PixelIcon } from "@/components/common/PixelIcon";
import { PixelDissolve } from "@/components/common/PixelDissolve";
import { Button } from "@/components/ui/button";
import { FlagIcon, TrophyIcon, BoltIcon, BadgeIcon } from "@/components/icons";
import { useSession } from "@/lib/contexts/session-context";
import styles from "./hero.module.scss";

export function Hero() {
  const t = useTranslations("landing.hero");
  const { user } = useSession();
  // Logged-in users skip the signin bounce and go straight to create.
  // Anonymous users land on signin with `next=/create` so the post-login
  // redirect honors their original intent rather than dumping them on
  // /explore.
  const createHref = user ? "/create" : "/signin?next=/create";

  return (
    <section className={styles.hero}>
      {/* Arena floor grid */}
      <div className={styles.arenaFloor} />

      {/* Spotlight effects */}
      <div className={styles.spotlight} />

      {/* Floating blocks with icons */}
      <Block size="medium" color="purple" className={styles.floatBlock1}>
        <FlagIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="gold" className={styles.floatBlock2}>
        <TrophyIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="green" className={styles.floatBlock3}>
        <BadgeIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="red" className={styles.floatBlock4}>
        <BoltIcon size={22} color="white" />
      </Block>
      <Block size="medium" color="purple" className={styles.floatBlock5}>
        <FlagIcon size={22} color="white" />
      </Block>

      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            <span className={styles.line1}>{t("headline1")}</span>
            <span className={styles.line2}>{t("headline2")}</span>
          </h1>

          <p className={styles.subtitle}>{t("subtitle")}</p>

          <div className={styles.ctas}>
            <Button href="/explore" variant="primary">
              {t("exploreCta")}
            </Button>
            <Button href={createHref} variant="secondary">
              {t("createCta")}
            </Button>
          </div>
        </div>

        <div className={styles.visual}>
          <PixelIcon shape="sword" blockSize={16} animate />
        </div>
      </div>

      {/* Pixel dissolve transition to next section */}
      <div className={styles.dissolveWrapper}>
        <PixelDissolve />
      </div>
    </section>
  );
}
