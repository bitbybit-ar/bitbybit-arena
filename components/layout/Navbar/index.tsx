"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Block } from "@/components/common/Block";
import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import { NostrLoginModal } from "@/components/layout/NostrLoginModal";
import styles from "./navbar.module.scss";

interface SessionUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function Navbar() {
  const t = useTranslations("common");
  const { theme, toggleTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) setUser(json.data);
      })
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    router.push("/");
  };

  const toggleLocale = () => {
    const newLocale = locale === "es" ? "en" : "es";
    const pathWithoutLocale = pathname.replace(/^\/(es|en)/, "");
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <>
      <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.inner}>
          <Link href="/" className={styles.logo}>
            <div className={styles.logoBlocks}>
              <Block size="tiny" color="purple" />
              <Block size="tiny" color="gold" />
              <Block size="tiny" color="green" />
            </div>
            <span className={styles.logoText}>
              BitByBit <span className={styles.logoAccent}>Arena</span>
            </span>
          </Link>

          <div className={styles.nav}>
            <div className={styles.toggleGroup}>
              <button
                className={styles.toggle}
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
              </button>
              <button
                className={styles.toggle}
                onClick={toggleLocale}
                aria-label={locale === "es" ? "Switch to English" : "Cambiar a Espanol"}
              >
                {locale === "es" ? "EN" : "ES"}
              </button>
            </div>

            {user ? (
              <>
                <Link href="/explore" className={styles.navLink}>
                  {t("explore") || "Explore"}
                </Link>
                <Link href="/my-challenges" className={styles.navLink}>
                  {t("myChallenges") || "My Challenges"}
                </Link>
                <div className={styles.userMenu}>
                  <span className={styles.userName}>{user.display_name}</span>
                  <button className={styles.signOutButton} onClick={handleSignOut}>
                    {t("signOut")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link href="/explore" className={styles.navLink}>
                  {t("explore") || "Explore"}
                </Link>
                <button
                  className={styles.signInButton}
                  onClick={() => setShowLogin(true)}
                >
                  {t("signIn")}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {showLogin && <NostrLoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
