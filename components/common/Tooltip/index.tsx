import { useId } from "react";
import styles from "./tooltip.module.scss";

interface TooltipProps {
  text: string;
  example?: string;
  label?: string;
}

export function Tooltip({ text, example, label = "More info" }: TooltipProps) {
  const id = useId();
  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={id}
      >
        ?
      </button>
      <span id={id} role="tooltip" className={styles.popover}>
        <span className={styles.text}>{text}</span>
        {example && <span className={styles.example}>{example}</span>}
      </span>
    </span>
  );
}
