import { Block } from "@/components/common/Block";
import styles from "./pixel-dissolve.module.scss";

type BlockColor = "purple" | "gold" | "green" | "red";

interface PixelDissolveProps {
  color?: BlockColor;
  className?: string;
}

const COLORS: BlockColor[] = ["purple", "gold", "green", "red"];

// Predefined scatter pattern — positions as % from left, opacity
const PARTICLES = [
  { left: 5, opacity: 0.06 },
  { left: 12, opacity: 0.1 },
  { left: 18, opacity: 0.08 },
  { left: 25, opacity: 0.15 },
  { left: 30, opacity: 0.12 },
  { left: 35, opacity: 0.18 },
  { left: 40, opacity: 0.2 },
  { left: 44, opacity: 0.22 },
  { left: 48, opacity: 0.25 },
  { left: 52, opacity: 0.25 },
  { left: 56, opacity: 0.22 },
  { left: 60, opacity: 0.2 },
  { left: 65, opacity: 0.18 },
  { left: 70, opacity: 0.12 },
  { left: 75, opacity: 0.15 },
  { left: 82, opacity: 0.1 },
  { left: 88, opacity: 0.08 },
  { left: 95, opacity: 0.06 },
];

export function PixelDissolve({ color, className = "" }: PixelDissolveProps) {
  return (
    <div className={`${styles.dissolve} ${className}`} aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className={styles.particle}
          style={{
            left: `${p.left}%`,
            opacity: p.opacity,
            top: `${Math.random() * 60}%`,
          }}
        >
          <Block
            size="tiny"
            color={color || COLORS[i % COLORS.length]}
          />
        </div>
      ))}
    </div>
  );
}
