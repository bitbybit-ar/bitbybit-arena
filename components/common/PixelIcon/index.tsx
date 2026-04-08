"use client";

import { Block } from "@/components/common/Block";
import styles from "./pixel-icon.module.scss";

type BlockColor = "purple" | "gold" | "green" | "red";

// Each pixel art shape is a 2D array: 0 = empty, color string = filled
type PixelGrid = (BlockColor | 0)[][];

const SHAPES: Record<string, PixelGrid> = {
  sword: [
    [0, 0, 0, "purple", "purple", 0, 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, "purple", "purple", "purple", "purple", 0, 0],
    [0, 0, 0, "purple", "purple", 0, 0, 0],
    ["gold", "gold", "gold", "gold", "gold", "gold", "gold", "gold"],
    ["gold", "gold", "gold", "gold", "gold", "gold", "gold", "gold"],
    [0, 0, 0, "red", "red", 0, 0, 0],
    [0, 0, 0, "red", "red", 0, 0, 0],
    [0, 0, 0, "red", "red", 0, 0, 0],
    [0, 0, "green", "green", "green", "green", 0, 0],
  ],
  shield: [
    [0, 0, "green", "green", "green", 0, 0],
    [0, "green", "green", "green", "green", "green", 0],
    ["green", "green", "green", "gold", "green", "green", "green"],
    ["green", "green", "gold", "gold", "gold", "green", "green"],
    ["green", "green", "green", "gold", "green", "green", "green"],
    [0, "green", "green", "green", "green", "green", 0],
    [0, 0, "green", "green", "green", 0, 0],
    [0, 0, 0, "green", 0, 0, 0],
  ],
  trophy: [
    ["gold", "gold", 0, 0, 0, "gold", "gold"],
    ["gold", "gold", "gold", "gold", "gold", "gold", "gold"],
    ["gold", "gold", "gold", "gold", "gold", "gold", "gold"],
    [0, "gold", "gold", "gold", "gold", "gold", 0],
    [0, 0, "gold", "gold", "gold", 0, 0],
    [0, 0, 0, "gold", 0, 0, 0],
    [0, 0, "purple", "purple", "purple", 0, 0],
    [0, "purple", "purple", "purple", "purple", "purple", 0],
  ],
  flag: [
    ["red", "purple", "purple", "purple", "purple", "purple"],
    ["red", "purple", "gold", "gold", "gold", "purple"],
    ["red", "purple", "gold", "gold", "gold", "purple"],
    ["red", "purple", "purple", "purple", "purple", "purple"],
    ["red", 0, 0, 0, 0, 0],
    ["red", 0, 0, 0, 0, 0],
    ["red", 0, 0, 0, 0, 0],
  ],
  vs: [
    ["red", "red", 0, 0, "red", "red", 0, "red", "red", "red"],
    ["red", "red", 0, 0, "red", "red", 0, "red", 0, 0],
    [0, "red", "red", "red", "red", 0, 0, "red", "red", 0],
    [0, 0, "red", "red", 0, 0, 0, 0, "red", "red"],
    [0, 0, "red", "red", 0, 0, 0, 0, "red", "red"],
    [0, 0, 0, 0, 0, 0, 0, "red", "red", 0],
    [0, 0, 0, 0, 0, 0, 0, "red", 0, 0],
  ],
  lightning: [
    [0, 0, "gold", "gold"],
    [0, "gold", "gold", 0],
    ["gold", "gold", "gold", "gold"],
    ["gold", "gold", "gold", "gold"],
    [0, 0, "gold", "gold"],
    [0, "gold", "gold", 0],
    ["gold", "gold", 0, 0],
  ],
};

interface PixelIconProps {
  shape: keyof typeof SHAPES;
  blockSize?: number;
  animate?: boolean;
  className?: string;
}

export function PixelIcon({
  shape,
  blockSize = 12,
  animate = false,
  className = "",
}: PixelIconProps) {
  const grid = SHAPES[shape];
  if (!grid) return null;

  const cols = grid[0].length;

  return (
    <div
      className={`${styles.pixelIcon} ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${blockSize}px)`,
        gap: "2px",
      }}
      aria-hidden="true"
    >
      {grid.flatMap((row, rowIdx) =>
        row.map((cell, colIdx) =>
          cell ? (
            <Block
              key={`${rowIdx}-${colIdx}`}
              size="tiny"
              color={cell}
              animation={animate ? "drop" : "none"}
              delay={animate ? (rowIdx * cols + colIdx) * 0.05 : 0}
              className={styles.pixel}
            />
          ) : (
            <div key={`${rowIdx}-${colIdx}`} className={styles.empty} />
          )
        )
      )}
    </div>
  );
}
