import type { IconProps } from "./types";

export function HandshakeIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 17l-5-5 5-5" />
      <path d="M13 7l5 5-5 5" />
    </svg>
  );
}
