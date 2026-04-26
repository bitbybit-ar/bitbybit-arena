import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import shells from "@/components/ui/skeleton/loading-shells.module.scss";

export default async function SettingsLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div className={shells.shell}>
      <SkeletonGroup ariaLabel={t("settings")}>
        <Skeleton height={36} width="30%" />
        <div className={shells.spacerXl} />
        <div className={shells.settingsRow}>
          <Skeleton circle width={96} height={96} />
          <div className={shells.settingsFields}>
            <Skeleton height={20} width="40%" />
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={120} />
          </div>
        </div>
      </SkeletonGroup>
    </div>
  );
}
