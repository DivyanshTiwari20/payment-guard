/** MCP tools: get_audit_log, verify_audit_integrity. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRecentEntries, verifyAuditIntegrity } from "../../engine/audit.js";
import { errorResult, textResult } from "../util.js";

export function registerAuditTools(server: McpServer): void {
  server.registerTool(
    "get_audit_log",
    {
      description:
        "Return the most recent audit entries (default 10). Each entry records the request, " +
        "the decision, the policy snapshot, the mandate used, and the hash chain links.",
      inputSchema: {
        count: z.number().int().positive().max(1000).optional().describe("How many recent entries (default 10)."),
      },
    },
    async ({ count }) => {
      try {
        const entries = getRecentEntries(count ?? 10);
        const lines = entries.map((e) => {
          const verdict = e.decision.allowed ? "ALLOWED" : "BLOCKED";
          return `· ${e.timestamp} — ${verdict} ${e.request.amount} → "${e.request.payee}" (${e.decision.reason})`;
        });
        const summary =
          entries.length === 0
            ? "Audit log is empty."
            : `Last ${entries.length} audit entr${entries.length === 1 ? "y" : "ies"}:\n${lines.join("\n")}`;
        return textResult(summary, entries);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "verify_audit_integrity",
    {
      description:
        "Walk the entire audit hash chain, recompute every hash, and report whether any " +
        "entry has been tampered with.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = verifyAuditIntegrity();
        const summary = result.valid
          ? `✅ Audit chain intact. ${result.entriesChecked} entr${result.entriesChecked === 1 ? "y" : "ies"} verified.`
          : `❌ Audit chain CORRUPTED. First bad entry: ${result.firstCorruptedEntry} (of ${result.entriesChecked} checked).`;
        return textResult(summary, result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
