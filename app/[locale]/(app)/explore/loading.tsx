import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import styles from "./explore.module.scss";

// Renders a content-shaped placeholder while the explore page's server
// data resolves. Mirrors the real layout closely enough that the
// hydrated grid drops in without a layout shift.
export default async function ExploreLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div className={styles.page}>
      <SkeletonGroup ariaLabel={t("exploreList")}>
        <Skeleton height={36} width="40%" />
        <div style={{ height: 16 }} />
        <Skeleton height={48} />
        <div style={{ height: 24 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={220} />
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}
