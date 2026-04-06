"use client";

import { useState, useEffect, useRef } from "react";
import { Block } from "@/components/common/Block";
import { BoltIcon } from "@/components/icons";
import styles from "./block-tower.module.scss";

const COLORS = ["purple", "gold", "green", "red"] as const;
type BlockColor = (typeof COLORS)[number];

interface BlockTowerProps {
  maxBlocks?: number;
  blockSize?: "small" | "medium" | "large";
  animate?: boolean;
  className?: string;
}

function getRandomColor(exclude?: BlockColor): BlockColor {
  const options = COLORS.filter((c) => c !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

export function BlockTower({
  maxBlocks = 4,
  blockSize = "large",
  animate = true,
  className = "",
}: BlockTowerProps) {
  const [blocks, setBlocks] = useState<BlockColor[]>([]);
  const [phase, setPhase] = useState<"building" | "pulsing">("building");
  const lastColor = useRef<BlockColor | undefined>(undefined);
  const timerRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (!animate) {
      // Static tower
      const staticBlocks: BlockColor[] = [];
      for (let i = 0; i < maxBlocks; i++) {
        const color = getRandomColor(staticBlocks[staticBlocks.length - 1]);
        staticBlocks.push(color);
      }
      setBlocks(staticBlocks);
      setPhase("pulsing");
      return;
    }

    const buildNext = () => {
      setBlocks((prev) => {
        if (prev.length >= maxBlocks) {
          setPhase("pulsing");
          return prev;
        }
        const color = getRandomColor(lastColor.current);
        lastColor.current = color;
        return [...prev, color];
      });
    };

    // Start building after initial delay
    timerRef.current = setTimeout(() => {
      buildNext();
      const interval = setInterval(() => {
        setBlocks((prev) => {
          if (prev.length >= maxBlocks) {
            clearInterval(interval);
            setPhase("pulsing");
            return prev;
          }
          const color = getRandomColor(lastColor.current);
          lastColor.current = color;
          return [...prev, color];
        });
      }, 350);

      return () => clearInterval(interval);
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [maxBlocks, animate]);

  const iconSize = blockSize === "large" ? 28 : blockSize === "medium" ? 20 : 14;

  return (
    <div className={`${styles.tower} ${className}`} aria-hidden="true">
      <div className={styles.blocks}>
        {blocks.map((color, i) => (
          <Block
            key={`${i}-${color}`}
            size={blockSize}
            color={color}
            animation={phase === "building" ? "drop" : "pulse"}
            delay={phase === "building" ? i * 0.35 : i * 0.5}
          >
            <BoltIcon size={iconSize} />
          </Block>
        ))}
      </div>
      {blocks.length > 0 && (
        <div
          className={styles.glow}
          style={{
            background: `radial-gradient(ellipse, var(--color-${blocks[blocks.length - 1] === "gold" ? "secondary" : blocks[blocks.length - 1] === "purple" ? "primary" : blocks[blocks.length - 1] === "green" ? "accent-alt" : "accent"}) 0%, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}
