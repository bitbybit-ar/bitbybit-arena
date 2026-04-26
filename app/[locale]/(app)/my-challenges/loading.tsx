import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import shells from "@/components/ui/skeleton/loading-shells.module.scss";

export default async function MyChallengesLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div className={shells.shell}>
      <SkeletonGroup ariaLabel={t("myChallenges")}>
        <Skeleton height={32} width="40%" />
        <div className={shells.spacerLg} />
        <Skeleton height={40} width="60%" />
        <div className={shells.spacerXl} />
        <div className={shells.cardGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={200} />
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}
