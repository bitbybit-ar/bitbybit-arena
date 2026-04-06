import { apiHandler } from "@/lib/api/handler";

export const GET = apiHandler(
  async (_req, { session }) => {
    return session;
  },
  { requireAuth: true }
);
