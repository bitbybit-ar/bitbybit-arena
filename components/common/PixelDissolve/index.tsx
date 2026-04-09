import { Block } from "@/components/common/Block";
import styles from "./pixel-dissolve.module.scss";

type BlockColor = "purple" | "gold" | "green" | "red";

interface PixelDissolveProps {
  color?: BlockColor;
  className?: string;
}

const COLORS: BlockColor[] = ["purple", "gold", "green", "red"];

// Predefined scatter pattern — positions as % from left, top offset, opacity
// Top values are fixed to avoid hydration mismatch (no Math.random())
const PARTICLES = [
  { left: 5, top: 32, opacity: 0.06 },
  { left: 12, top: 8, opacity: 0.1 },
  { left: 18, top: 47, opacity: 0.08 },
  { left: 25, top: 15, opacity: 0.15 },
  { left: 30, top: 53, opacity: 0.12 },
  { left: 35, top: 22, opacity: 0.18 },
  { left: 40, top: 41, opacity: 0.2 },
  { left: 44, top: 5, opacity: 0.22 },
  { left: 48, top: 35, opacity: 0.25 },
  { left: 52, top: 58, opacity: 0.25 },
  { left: 56, top: 12, opacity: 0.22 },
  { left: 60, top: 44, opacity: 0.2 },
  { left: 65, top: 28, opacity: 0.18 },
  { left: 70, top: 51, opacity: 0.12 },
  { left: 75, top: 9, opacity: 0.15 },
  { left: 82, top: 38, opacity: 0.1 },
  { left: 88, top: 19, opacity: 0.08 },
  { left: 95, top: 55, opacity: 0.06 },
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
            top: `${p.top}%`,
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
