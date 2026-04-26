import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export default async function MyChallengesLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div style={{ padding: 24 }}>
      <SkeletonGroup ariaLabel={t("myChallenges")}>
        <Skeleton height={32} width="40%" />
        <div style={{ height: 16 }} />
        <Skeleton height={40} width="60%" />
        <div style={{ height: 24 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={200} />
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}
