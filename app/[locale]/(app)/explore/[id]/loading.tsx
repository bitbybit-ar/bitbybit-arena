import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import shells from "@/components/ui/skeleton/loading-shells.module.scss";

// Challenge-detail skeleton. Two-column layout on desktop matches the
// real page; on mobile both columns stack via the shells.detailGrid
// breakpoint.
export default async function ChallengeDetailLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div className={shells.shell}>
      <SkeletonGroup ariaLabel={t("challengeDetail")}>
        <Skeleton height={32} width="60%" />
        <div className={shells.spacerMd} />
        <Skeleton height={20} width="35%" />
        <div className={shells.spacerXl} />
        <div className={shells.detailGrid}>
          <div className={shells.detailColumn}>
            <Skeleton height={180} />
            <Skeleton height={120} />
            <Skeleton height={80} />
          </div>
          <div className={shells.detailColumn}>
            <Skeleton height={140} />
            <Skeleton height={200} />
          </div>
        </div>
      </SkeletonGroup>
    </div>
  );
}
