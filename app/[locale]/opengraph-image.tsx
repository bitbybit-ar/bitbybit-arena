import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "BitByBit Arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "landing.hero",
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0F0F1A 0%, #1A1A2E 55%, #2A1F4A 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: "32px",
            opacity: 0.75,
          }}
        >
          <div
            style={{
              display: "flex",
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#8B5CF6",
            }}
          />
          <span>BitByBit Arena</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "96px",
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            <span>{t("headline1")}</span>
            <span style={{ color: "#F7A825" }}>{t("headline2")}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "32px",
              opacity: 0.85,
              maxWidth: "960px",
              lineHeight: 1.3,
            }}
          >
            {t("subtitle")}
          </div>
        </div>
      </div>
    ),
    size
  );
}
