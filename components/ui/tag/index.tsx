import React from "react";
import { cn } from "@/lib/utils";
import styles from "./tag.module.scss";

interface TagProps {
  variant?: "purple" | "gold" | "green" | "red";
  children: React.ReactNode;
}

export const Tag: React.FC<TagProps> = ({ variant = "purple", children }) => {
  return (
    <span className={cn(styles.tag, styles[`variant-${variant}`])}>
      {children}
    </span>
  );
};

export default Tag;
