import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export default async function CreateLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div style={{ padding: 24 }}>
      <SkeletonGroup ariaLabel={t("createForm")}>
        <Skeleton height={36} width="35%" />
        <div style={{ height: 24 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Skeleton height={16} width="20%" />
            <div style={{ height: 8 }} />
            <Skeleton height={48} />
          </div>
        ))}
      </SkeletonGroup>
    </div>
  );
}
