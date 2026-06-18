/** MCP tools: create_mandate, list_mandates, revoke_mandate, get_mandate. */

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizePayee } from "../../engine/policy-engine.js";
import { mandateStatus, remainingBudget } from "../../engine/mandate-engine.js";
import type { Mandate } from "../../engine/types.js";
import { loadMandates, saveMandates } from "../../storage/repository.js";
import { errorResult, textResult } from "../util.js";

/** Mandate plus its computed status, for read responses. */
function describe(mandate: Mandate) {
  return {
    ...mandate,
    status: mandateStatus(mandate),
    remainingBudget: remainingBudget(mandate),
  };
}

export function registerMandateTools(server: McpServer): void {
  server.registerTool(
    "create_mandate",
    {
      description:
        "Create a scoped, expiring authorization to pay a payee. This is the explicit " +
        "user action that authorizes future payments. The payee is normalized. A mandate " +
        "MUST have an expiry (expiresAt).",
      inputSchema: {
        payee: z.string().min(1).describe("Payee name (will be normalized)."),
        maxAmount: z.number().positive().describe("Max amount per transaction."),
        totalBudget: z.number().positive().describe("Total spend allowed over the mandate's life."),
        purpose: z.string().min(1).describe("Human-readable purpose, e.g. 'electricity bills'."),
        expiresAt: z.string().datetime().describe("ISO 8601 expiry (required)."),
      },
    },
    async ({ payee, maxAmount, totalBudget, purpose, expiresAt }) => {
      try {
        if (Date.parse(expiresAt) <= Date.now()) {
          return errorResult("expiresAt must be in the future.");
        }
        if (maxAmount > totalBudget) {
          return errorResult("maxAmount cannot exceed totalBudget.");
        }

        const mandate: Mandate = {
          id: randomUUID(),
          payee: normalizePayee(payee),
          maxAmount,
          totalBudget,
          spent: 0,
          purpose,
          createdAt: new Date().toISOString(),
          expiresAt,
          revoked: false,
          revokedAt: null,
        };

        const mandates = loadMandates();
        mandates.push(mandate);
        saveMandates(mandates);
        console.error(`[create_mandate] created ${mandate.id} for ${mandate.payee}`);
        return textResult(
          `Mandate created for "${mandate.payee}" (${purpose}): up to ${maxAmount}/tx, ` +
            `${totalBudget} total, expires ${expiresAt}.`,
          describe(mandate),
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "list_mandates",
    {
      description: "List all mandates with their computed status (active/expired/revoked/exhausted).",
      inputSchema: {
        payee: z.string().optional().describe("Optionally filter by payee (normalized)."),
      },
    },
    async ({ payee }) => {
      try {
        let mandates = loadMandates();
        if (payee) {
          const normalized = normalizePayee(payee);
          mandates = mandates.filter((m) => m.payee === normalized);
        }
        const described = mandates.map(describe);
        const counts = described.reduce<Record<string, number>>((acc, m) => {
          acc[m.status] = (acc[m.status] ?? 0) + 1;
          return acc;
        }, {});
        const summary = `${described.length} mandate(s): ${
          Object.entries(counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ") || "none"
        }.`;
        return textResult(summary, described);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "get_mandate",
    {
      description: "Get the details and status of a specific mandate by id.",
      inputSchema: {
        id: z.string().describe("Mandate id (UUID)."),
      },
    },
    async ({ id }) => {
      try {
        const mandate = loadMandates().find((m) => m.id === id);
        if (!mandate) return errorResult(`No mandate found with id ${id}.`);
        return textResult(`Mandate ${id} is ${mandateStatus(mandate)}.`, describe(mandate));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "revoke_mandate",
    {
      description: "Revoke a mandate by id. Revoked mandates can never authorize payments again.",
      inputSchema: {
        id: z.string().describe("Mandate id (UUID)."),
      },
    },
    async ({ id }) => {
      try {
        const mandates = loadMandates();
        const mandate = mandates.find((m) => m.id === id);
        if (!mandate) return errorResult(`No mandate found with id ${id}.`);
        if (mandate.revoked) {
          return textResult(`Mandate ${id} was already revoked.`, describe(mandate));
        }
        mandate.revoked = true;
        mandate.revokedAt = new Date().toISOString();
        saveMandates(mandates);
        console.error(`[revoke_mandate] revoked ${id}`);
        return textResult(`Mandate ${id} revoked.`, describe(mandate));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
