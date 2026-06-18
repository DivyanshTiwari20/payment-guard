/** MCP tool: make_payment. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { processPayment } from "../../payment-service.js";
import { errorResult, textResult } from "../util.js";

export function registerPaymentTools(server: McpServer): void {
  server.registerTool(
    "make_payment",
    {
      description:
        "Request a payment on the user's behalf. PaymentGuard checks it against " +
        "deterministic rules and returns allowed/blocked with a reason. " +
        "A payment is ONLY approved if an active, non-revoked, non-expired mandate " +
        "exists for the (normalized) payee with enough per-transaction and remaining " +
        "budget — AND the global policy (per-payment cap, daily limit, expiry) also " +
        "passes. If there is no mandate, the payment is blocked: create one first with " +
        "create_mandate (which requires explicit user authorization).",
      inputSchema: {
        payee: z.string().describe("Name of the payee, e.g. 'Electricity Board'."),
        amount: z.number().positive().describe("Amount to pay (max 2 decimal places)."),
      },
    },
    async ({ payee, amount }) => {
      try {
        const result = processPayment({ payee, amount });
        const status = result.decision.allowed ? "✅ ALLOWED" : "❌ BLOCKED";
        const summary = `${status} — ${result.decision.reason}`;
        console.error(`[make_payment] ${summary}`);
        return textResult(summary, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[make_payment] error: ${message}`);
        return errorResult(message);
      }
    },
  );
}
