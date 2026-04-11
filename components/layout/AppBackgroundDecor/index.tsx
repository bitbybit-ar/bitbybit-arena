import { Bubble } from "@/components/common/Bubble";
import { Block } from "@/components/common/Block";
import {
  BoltIcon,
  TrophyIcon,
  FlagIcon,
  BadgeIcon,
  HeartIcon,
} from "@/components/icons";
import styles from "./app-background-decor.module.scss";

export function AppBackgroundDecor() {
  return (
    <div className={styles.decor} aria-hidden="true">
      <Bubble size={72} color="purple" variant="icon" icon={<FlagIcon />} opacity={0.3} position={{ top: "12%", left: "2%" }} animation="float" delay={0} />
      <Bubble size={44} color="gold" variant="solid" opacity={0.25} position={{ top: "30%", left: "5%" }} animation="drift" delay={1.2} />
      <Bubble size={58} color="green" variant="icon" icon={<HeartIcon />} opacity={0.3} position={{ top: "55%", left: "1%" }} animation="float-slow" delay={0.6} />
      <Bubble size={36} color="red" variant="solid" opacity={0.2} position={{ bottom: "20%", left: "4%" }} animation="drift" delay={2} />
      <Bubble size={64} color="gold" variant="icon" icon={<TrophyIcon />} opacity={0.3} position={{ top: "18%", right: "3%" }} animation="float" delay={0.8} />
      <Bubble size={40} color="purple" variant="solid" opacity={0.22} position={{ top: "40%", right: "6%" }} animation="float-slow" delay={1.6} />
      <Bubble size={52} color="green" variant="solid" opacity={0.25} position={{ bottom: "28%", right: "2%" }} animation="drift" delay={0.4} />

      <Block size="small" color="purple" className={styles.floatBlock1}>
        <BoltIcon size={16} color="white" />
      </Block>
      <Block size="tiny" color="gold" className={styles.floatBlock2} />
      <Block size="small" color="green" className={styles.floatBlock3}>
        <BadgeIcon size={16} color="white" />
      </Block>
      <Block size="tiny" color="red" className={styles.floatBlock4} />
      <Block size="small" color="red" className={styles.floatBlock5}>
        <FlagIcon size={16} color="white" />
      </Block>
      <Block size="tiny" color="purple" className={styles.floatBlock6} />
    </div>
  );
}
