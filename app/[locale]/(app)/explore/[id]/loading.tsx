import { getTranslations } from "next-intl/server";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

// Challenge-detail skeleton. Two-column layout on desktop matches the
// real page; on mobile both columns stack via the inline grid template.
export default async function ChallengeDetailLoading() {
  const t = await getTranslations("loadingStates");
  return (
    <div style={{ padding: 24 }}>
      <SkeletonGroup ariaLabel={t("challengeDetail")}>
        <Skeleton height={32} width="60%" />
        <div style={{ height: 12 }} />
        <Skeleton height={20} width="35%" />
        <div style={{ height: 24 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={180} />
            <Skeleton height={120} />
            <Skeleton height={80} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={140} />
            <Skeleton height={200} />
          </div>
        </div>
      </SkeletonGroup>
    </div>
  );
}
