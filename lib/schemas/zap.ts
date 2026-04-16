/**
 * Schemas for `/api/zap/*`. Currently just the BOLT11 lookup
 * endpoint. We don't validate the invoice's BOLT11 format here —
 * `extractPaymentHash()` does that and throws BadRequestError if it
 * can't find a hash, which is the only signal we actually need.
 */
import { z } from "zod";

export const ZapStatusBodySchema = z.object({
  invoice: z
    .string({ error: "Missing invoice" })
    .min(1, "Missing invoice"),
});

export type ZapStatusBody = z.infer<typeof ZapStatusBodySchema>;
