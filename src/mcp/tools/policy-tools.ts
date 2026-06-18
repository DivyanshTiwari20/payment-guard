/** MCP tools: set_policy, get_policy, reset_daily_spend. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizePayee } from "../../engine/policy-engine.js";
import type { Policy } from "../../engine/types.js";
import {
  loadPolicy,
  loadSpendToday,
  resetSpendToday,
  savePolicy,
} from "../../storage/repository.js";
import { errorResult, textResult } from "../util.js";

export function registerPolicyTools(server: McpServer): void {
  server.registerTool(
    "set_policy",
    {
      description:
        "Update the global spending policy. Any omitted field is left unchanged. " +
        "Payees added/removed are normalized. Set expiresOn to an ISO 8601 string " +
        "to expire the whole policy, or null to clear the expiry.",
      inputSchema: {
        maxAmount: z.number().positive().optional().describe("Per-payment cap."),
        dailyLimit: z.number().positive().optional().describe("Total daily cap."),
        addPayees: z.array(z.string()).optional().describe("Payees to add to the allowlist."),
        removePayees: z.array(z.string()).optional().describe("Payees to remove."),
        expiresOn: z
          .string()
          .datetime()
          .nullable()
          .optional()
          .describe("ISO 8601 policy expiry, or null to clear."),
      },
    },
    async (args) => {
      try {
        const policy = loadPolicy();
        const next: Policy = { ...policy };

        if (args.maxAmount !== undefined) next.maxAmount = args.maxAmount;
        if (args.dailyLimit !== undefined) next.dailyLimit = args.dailyLimit;
        if (args.expiresOn !== undefined) next.expiresOn = args.expiresOn;

        const payees = new Set(next.allowedPayees.map(normalizePayee));
        for (const p of args.addPayees ?? []) payees.add(normalizePayee(p));
        for (const p of args.removePayees ?? []) payees.delete(normalizePayee(p));
        next.allowedPayees = [...payees].filter((p) => p.length > 0);

        savePolicy(next);
        console.error("[set_policy] policy updated");
        return textResult("Policy updated.", next);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "get_policy",
    {
      description: "Return the current global spending policy and today's spend so far.",
      inputSchema: {},
    },
    async () => {
      try {
        const policy = loadPolicy();
        const spend = loadSpendToday();
        const summary =
          `Per-payment cap: ${policy.maxAmount} · Daily limit: ${policy.dailyLimit} ` +
          `· Spent today: ${spend.spent} · Allowlist: ` +
          `${policy.allowedPayees.length === 0 ? "(empty — mandate-driven)" : policy.allowedPayees.join(", ")}` +
          `${policy.expiresOn ? ` · Expires: ${policy.expiresOn}` : ""}`;
        return textResult(summary, { policy, spentToday: spend.spent });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "reset_daily_spend",
    {
      description: "Manually reset the daily spend counter to 0.",
      inputSchema: {},
    },
    async () => {
      try {
        resetSpendToday();
        console.error("[reset_daily_spend] daily spend reset to 0");
        return textResult("Daily spend counter reset to 0.", { spentToday: 0 });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
