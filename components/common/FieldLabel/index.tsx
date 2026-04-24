import { type ReactNode } from "react";
import { Tooltip } from "@/components/common/Tooltip";
import styles from "./field-label.module.scss";

interface FieldLabelProps {
  htmlFor?: string;
  children: ReactNode;
  tooltip?: { text: string; example?: string };
  required?: boolean;
}

// Small helper: label + optional tooltip rendered as sibling of the <label>,
// not a child. Avoids the "click tooltip → focus input" side effect caused by
// nesting interactive elements inside a <label htmlFor>.
export function FieldLabel({
  htmlFor,
  children,
  tooltip,
  required,
}: FieldLabelProps) {
  const inner = (
    <>
      {children}
      {required && <span className={styles.required}>*</span>}
    </>
  );
  return (
    <div className={styles.labelRow}>
      {htmlFor ? <label htmlFor={htmlFor}>{inner}</label> : <span>{inner}</span>}
      {tooltip && <Tooltip text={tooltip.text} example={tooltip.example} />}
    </div>
  );
}
