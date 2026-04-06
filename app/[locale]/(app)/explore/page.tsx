import { useTranslations } from "next-intl";

export default function ExplorePage() {
  const t = useTranslations("explore");
  return (
    <div style={{ padding: "100px 24px 24px" }}>
      <h1>{t("title")}</h1>
    </div>
  );
}
