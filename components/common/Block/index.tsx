import styles from "./block.module.scss";

type BlockSize = "tiny" | "small" | "medium" | "large";
type BlockColor = "purple" | "gold" | "green" | "red";

interface BlockProps {
  size?: BlockSize;
  color: BlockColor;
  animation?: "drop" | "pulse" | "none";
  delay?: number;
  className?: string;
  children?: React.ReactNode;
}

export function Block({
  size = "medium",
  color,
  animation = "none",
  delay = 0,
  className = "",
  children,
}: BlockProps) {
  const animClass =
    animation === "drop"
      ? styles.drop
      : animation === "pulse"
        ? styles.pulse
        : "";

  return (
    <div
      className={`${styles.block} ${styles[size]} ${styles[color]} ${animClass} ${className}`}
      style={{ animationDelay: `${delay}s` }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
