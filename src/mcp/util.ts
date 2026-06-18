/**
 * Shared helpers for MCP tool responses.
 *
 * Every tool returns a single text content block combining a human-readable
 * summary (so the agent can explain the outcome to the user) with the raw JSON
 * payload (so the agent can reason over structured data).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResult = CallToolResult;

/** Build a standard tool result: summary line(s) followed by pretty JSON. */
export function textResult(summary: string, data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
  };
}

/** Build an error tool result (fail-closed surface for unexpected exceptions). */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
