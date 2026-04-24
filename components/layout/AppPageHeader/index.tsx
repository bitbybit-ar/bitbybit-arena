"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ArrowLeftIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import styles from "./app-page-header.module.scss";

interface AppPageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  /**
   * Pins the header below the navbar while the page scrolls so the
   * primary action stays reachable. Defaults to true; pass false only
   * for short pages where sticking would waste vertical space.
   */
  sticky?: boolean;
}

export function AppPageHeader({
  title,
  backHref,
  backLabel,
  actions,
  sticky = true,
}: AppPageHeaderProps) {
  const t = useTranslations("common");
  return (
    <div className={cn(styles.header, sticky && styles.headerSticky)}>
      <div className={styles.left}>
        {backHref && (
          <Link
            href={backHref}
            className={styles.back}
            aria-label={backLabel ?? t("back")}
          >
            <ArrowLeftIcon size={18} />
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
