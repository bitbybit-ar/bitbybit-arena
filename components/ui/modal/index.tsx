"use client";

import { useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { CloseIcon } from "@/components/icons";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import styles from "./modal.module.scss";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  className?: string;
}

export function Modal({ children, onClose, title, size = "md", className }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, onClose);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div
        ref={modalRef}
        className={cn(styles.modal, styles[size], className)}
      >
        {title && <h3 className={styles.title}>{title}</h3>}
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

export default Modal;
