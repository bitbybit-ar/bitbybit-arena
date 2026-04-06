"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Block } from "@/components/common/Block";
import { NostrLoginModal } from "@/components/layout/NostrLoginModal";
import styles from "./navbar.module.scss";

export function Navbar() {
  const t = useTranslations("common");
  const [scrolled, setScrolled] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.inner}>
          <div className={styles.logo}>
            <div className={styles.logoBlocks}>
              <Block size="tiny" color="purple" />
              <Block size="tiny" color="gold" />
              <Block size="tiny" color="green" />
            </div>
            <span className={styles.logoText}>
              BitByBit <span className={styles.logoAccent}>Challenges</span>
            </span>
          </div>

          <button
            className={styles.signInButton}
            onClick={() => setShowLogin(true)}
          >
            {t("signIn")}
          </button>
        </div>
      </nav>

      {showLogin && <NostrLoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
