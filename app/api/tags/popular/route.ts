import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { LimitSchema } from "@/lib/schemas/pagination";

const QuerySchema = z.object({ limit: LimitSchema(1, 100, 20) });

export const GET = apiHandler(
  async (req: NextRequest, { db }) => {
    const { limit } = parseQuery(req, QuerySchema);

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
