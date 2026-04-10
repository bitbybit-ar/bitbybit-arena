"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Block } from "@/components/common/Block";
import { MoonIcon, SunIcon, SettingsIcon, UserIcon } from "@/components/icons";
import { useTheme } from "@/lib/contexts/theme-context";
import { useSession } from "@/lib/contexts/session-context";
import { useScrollVisibility } from "@/lib/hooks/useScrollVisibility";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import styles from "./navbar.module.scss";

export function Navbar() {
  const t = useTranslations("common");
  const { theme, toggleTheme } = useTheme();
  const { user, clear } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { visible, scrolled } = useScrollVisibility();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await fetch("/api/auth/signout", { method: "POST" });
    clear();
    router.push("/");
  };

  const toggleLocale = () => {
    const newLocale = locale === "es" ? "en" : "es";
    const pathWithoutLocale = pathname.replace(/^\/(es|en)/, "");
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  const logoHref = user ? `/${locale}/explore` : "/";

  const navbarClasses = [
    styles.navbar,
    scrolled ? styles.scrolled : "",
    !visible ? styles.hidden : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={navbarClasses}>
      <div className={styles.inner}>
        <Link href={logoHref} className={styles.logo}>
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
              <div className={styles.avatarWrapper} ref={menuRef}>
                <button
                  className={styles.avatar}
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                >
                  {user.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt={user.display_name}
                      width={36}
                      height={36}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <UserIcon size={18} />
                  )}
                </button>
                {menuOpen && (
                  <div className={styles.avatarMenu} role="menu">
                    <Link
                      href={`/${locale}/settings`}
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      <SettingsIcon size={14} />
                      {t("settings")}
                    </Link>
                    <button
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={handleSignOut}
                    >
                      <UserIcon size={14} />
                      {t("signOut")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/explore" className={styles.navLink}>
                {t("explore") || "Explore"}
              </Link>
              <Link href="/signin" className={styles.signInButton}>
                {t("signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
