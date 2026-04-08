import type { IconProps } from "./types";

export function NostrichIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-2.09c-2.12-.23-3.96-1.29-5.07-2.91l1.42-1.42C8.47 12.5 10.15 13.5 12 13.5s3.53-1 4.65-2.42l1.42 1.42c-1.11 1.62-2.95 2.68-5.07 2.91V17.5h-2z" />
    </svg>
  );
}
