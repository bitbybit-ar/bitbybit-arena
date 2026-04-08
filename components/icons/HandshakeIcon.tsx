import type { IconProps } from "./types";

export function HandshakeIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.5 11.5L17 8l-4.5 1L9 5.5 3.5 11" />
      <path d="M3.5 11l4 4 3-1 2.5 2.5 2.5-1 4-4" />
      <path d="M2 15.5l3.5-1" />
      <path d="M18.5 16.5L22 15" />
    </svg>
  );
}
