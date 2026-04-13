import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";

export const GET = apiHandler(
  async (req: NextRequest, { db }) => {
    const rawLimit = Number(req.nextUrl.searchParams.get("limit")) || 20;
    const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100);

    const { rows } = await db.execute<{ tag: string; count: number }>(sql`
      SELECT tag, COUNT(*)::int AS count
      FROM challenges, UNNEST(tags) AS tag
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT ${limit}
    `);

    return rows;
  },
  { requireAuth: false }
);
