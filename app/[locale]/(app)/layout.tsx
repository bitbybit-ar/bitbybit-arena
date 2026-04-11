import { AppBackgroundDecor } from "@/components/layout/AppBackgroundDecor";
import styles from "./layout.module.scss";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrapper}>
      <AppBackgroundDecor />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
