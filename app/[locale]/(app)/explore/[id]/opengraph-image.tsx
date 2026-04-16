import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { getDb, challenges, users } from "@/lib/db";
import { isUuid } from "@/lib/utils";

export const alt = "BitByBit Arena challenge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TYPE_COLORS: Record<string, string> = {
  streak: "#F7A825",
  competition: "#EF4444",
  creative: "#22C55E",
  race: "#F7A825",
  one_time: "#8B5CF6",
};

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return fallbackImage();
  }

  const rows = await getDb()
    .select({
      title: challenges.title,
      description: challenges.description,
      type: challenges.type,
      creator: users.display_name,
    })
    .from(challenges)
    .innerJoin(users, eq(challenges.creator_id, users.id))
    .where(eq(challenges.id, id))
    .limit(1);

  const challenge = rows[0];
  if (!challenge) return fallbackImage();

  const accent = TYPE_COLORS[challenge.type] ?? TYPE_COLORS.one_time;
  const shortDesc =
    challenge.description.length > 180
      ? challenge.description.slice(0, 179).trimEnd() + "…"
      : challenge.description;

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
            fontSize: "28px",
            opacity: 0.7,
          }}
        >
          <div
            style={{
              display: "flex",
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: accent,
            }}
          />
          <span>BitByBit Arena</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: "1040px",
            }}
          >
            {challenge.title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              opacity: 0.8,
              maxWidth: "1040px",
              lineHeight: 1.4,
            }}
          >
            {shortDesc}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            fontSize: "26px",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: "999px",
              background: accent,
              color: "#0F0F1A",
              fontWeight: 700,
            }}
          >
            {challenge.type.replace("_", " ")}
          </div>
          <span style={{ opacity: 0.7 }}>by {challenge.creator}</span>
        </div>
      </div>
    ),
    size
  );
}

function fallbackImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F0F1A",
          color: "#FFFFFF",
          fontSize: "64px",
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        BitByBit Arena
      </div>
    ),
    size
  );
}
