import { type ReactNode } from "react";
import { Link } from "@/i18n/routing";
import { ArrowLeftIcon } from "@/components/icons";
import styles from "./app-page-header.module.scss";

interface AppPageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}

export function AppPageHeader({
  title,
  backHref,
  backLabel,
  actions,
}: AppPageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <Link
            href={backHref}
            className={styles.back}
            aria-label={backLabel ?? "Back"}
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
