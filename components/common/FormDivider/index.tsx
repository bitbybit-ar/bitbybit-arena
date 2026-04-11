import styles from "./form-divider.module.scss";

interface FormDividerProps {
  label: string;
}

export function FormDivider({ label }: FormDividerProps) {
  return (
    <div className={styles.divider}>
      <span className={styles.label}>{label}</span>
      <span className={styles.line} aria-hidden="true" />
    </div>
  );
}
