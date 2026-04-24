import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./section.module.scss";

interface SectionProps {
  children: ReactNode;
  /** Optional extra class merged onto the surface wrapper. */
  className?: string;
}

/**
 * Surface tile used to wrap lists and grouped content across the app.
 * Pairs with <SectionTitle> as its first child to preserve the visual
 * layout of the legacy `.section` / `.sectionTitle` SCSS pattern.
 */
export function Section({ children, className }: SectionProps) {
  return <div className={cn(styles.section, className)}>{children}</div>;
}

interface SectionTitleProps {
  children: ReactNode;
  className?: string;
}

/** Heading for a <Section>. Renders as an <h2> to match the prior markup. */
export function SectionTitle({ children, className }: SectionTitleProps) {
  return <h2 className={cn(styles.sectionTitle, className)}>{children}</h2>;
}
