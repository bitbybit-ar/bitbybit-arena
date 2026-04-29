"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { Block } from "@/components/common/Block";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { LogoutIcon, MoonIcon, SunIcon, SettingsIcon, UserIcon } from "@/components/icons";
import { useTheme } from "@/lib/contexts/theme-context";
import { useSession } from "@/lib/contexts/session-context";
import { useSignerContext } from "@/lib/signer-context";
import { useScrollVisibility } from "@/lib/hooks/useScrollVisibility";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import styles from "./navbar.module.scss";

export function Navbar() {
  const t = useTranslations("common");
  const tNav = useTranslations("navbar");
  const { theme, toggleTheme } = useTheme();
  const { user } = useSession();
  const { clearSigner } = useSignerContext();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { visible, scrolled } = useScrollVisibility();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await fetch("/api/auth/signout", { method: "POST" });
    // clearSigner closes the in-memory signer AND clears the session
    // state via SessionProvider.clear().
    await clearSigner();
    router.push("/");
  };

  const toggleLocale = () => {
    const newLocale = locale === "es" ? "en" : "es";
    router.replace(pathname, { locale: newLocale });
  };

  const logoHref = user ? "/explore" : "/";

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
              aria-label={mounted && theme === "dark" ? tNav("switchToLightMode") : tNav("switchToDarkMode")}
              suppressHydrationWarning
            >
              {mounted ? (
                theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />
              ) : (
                <MoonIcon size={14} />
              )}
            </button>
            <button
              className={styles.toggle}
              onClick={toggleLocale}
              aria-label={locale === "es" ? tNav("switchToEnglish") : tNav("switchToSpanish")}
            >
              {locale === "es" ? "EN" : "ES"}
            </button>
          </div>

          {user ? (
            <>
              <Button
                href="/explore"
                variant="ghost"
                size="sm"
                className={styles.desktopOnly}
              >
                {t("explore") || "Explore"}
              </Button>
              <NotificationBell />
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
                  // Plain dropdown — not a WAI-ARIA `menu`. The previous
                  // role="menu"/menuitem markup implied arrow-key
                  // navigation we never wired up; Tab is the natural
                  // traversal across the three children anyway. Dropping
                  // the roles lets <a> and <button> announce themselves
                  // correctly without leaking a half-implemented menu
                  // pattern.
                  <div className={styles.avatarMenu}>
                    <Link
                      href={`/profile/${user.nostr_pubkey}`}
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      <UserIcon size={14} />
                      {t("profile")}
                    </Link>
                    <Link
                      href="/settings"
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      <SettingsIcon size={14} />
                      {t("settings")}
                    </Link>
                    <button
                      className={styles.menuItem}
                      onClick={handleSignOut}
                    >
                      <LogoutIcon size={14} />
                      {t("signOut")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Button
                href="/explore"
                variant="ghost"
                size="sm"
                className={styles.desktopOnly}
              >
                {t("explore") || "Explore"}
              </Button>
              <Button href="/signin" variant="primary" size="sm">
                {t("signIn")}
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
