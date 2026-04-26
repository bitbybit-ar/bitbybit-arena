import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export default async function SettingsLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div style={{ padding: 24 }}>
      <SkeletonGroup ariaLabel={t("settings")}>
        <Skeleton height={36} width="30%" />
        <div style={{ height: 24 }} />
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <Skeleton circle width={96} height={96} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
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
