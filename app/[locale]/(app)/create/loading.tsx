import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import shells from "@/components/ui/skeleton/loading-shells.module.scss";

export default async function CreateLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div className={shells.shell}>
      <SkeletonGroup ariaLabel={t("createForm")}>
        <Skeleton height={36} width="35%" />
        <div className={shells.spacerXl} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={shells.fieldGroup}>
            <Skeleton height={16} width="20%" />
            <div className={shells.spacerSm} />
            <Skeleton height={48} />
          </div>
        ))}
      </SkeletonGroup>
    </div>
  );
}
