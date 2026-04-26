import { NextRequest } from "next/server";
import { NWCClient } from "@getalby/sdk";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { BadRequestError } from "@/lib/api/errors";
import { ZapStatusBodySchema } from "@/lib/schemas/zap";
import { extractPaymentHash } from "@/lib/lightning";

const NWC_URL = process.env.NWC_CONNECTION_URL;

// POST /api/zap/status — check if a BOLT11 invoice has been paid via NWC
export const POST = apiHandler(
  async (req: NextRequest) => {
    if (!NWC_URL) {
      return { paid: false };
    }

    const { invoice } = await parseBody(req, ZapStatusBodySchema);

    const paymentHash = extractPaymentHash(invoice);
    if (!paymentHash) {
      throw new BadRequestError("Could not extract payment hash", "invalid_invoice");
    }

    const client = new NWCClient({ nostrWalletConnectUrl: NWC_URL });

    try {
      // Primary: lookupInvoice by payment_hash
      const result = await client.lookupInvoice({ payment_hash: paymentHash });

      if (result.settled_at) {
        return { paid: true };
      }

      return { paid: false };
    } catch {
      // Fallback: some wallets don't support lookupInvoice — try listTransactions
      try {
        const txs = await client.listTransactions({ limit: 20 });
        const found = txs.transactions?.find(
          (tx: { payment_hash?: string; state?: string }) =>
            tx.payment_hash === paymentHash && tx.state === "settled"
        );

        return { paid: !!found };
      } catch {
        return { paid: false };
      }
    } finally {
      client.close();
    }
  },
  { requireAuth: false, rateLimit: "standard" }
);
